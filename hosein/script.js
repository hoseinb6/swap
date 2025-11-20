// =======================================
// CONTRACT ADDRESSES & ABIs
// =======================================
const zgtTokenAddress = "0x9f684a1b8533297EBfb026603D5a5fc91faCC1a4";
const zgtTokenABI = [ "function approve(address spender, uint256 amount) returns (bool)", "function balanceOf(address account) view returns (uint256)", "function allowance(address owner, address spender) view returns (uint256)" ];
const swapContractAddress = "0xA796C2666bed16C4d88186dAb06f251b2e6AFBD2";
const swapContractABI = [ "function swapZtcToZgt() payable", "function swapZgtToZtc(uint256 _tokenAmountIn)", "event Swap(address indexed user, uint256 ztcAmount, uint256 tokenAmount)" ];
const hubContractAddress = "0xa96C6dA72e8ad2995B299E90A81A4d632E6F8730";
const hubContractABI = [ "function deposit(uint256 _amount)", "function withdraw(uint256 _amount)", "function playCoinFlip(uint256 _betAmount, bool _headsChoice)", "function balances(address) view returns (uint256)", "event Deposit(address indexed user, uint256 amount)", "event Withdraw(address indexed user, uint256 amount)", "event CoinFlipResult(address indexed player, uint256 betAmount, bool won)" ];

// =======================================
// GLOBAL VARIABLES
// =======================================
const zenChainTestnet = { chainId: '0x20D8', chainName: 'ZenChain Testnet', nativeCurrency: { name: 'ZTC', symbol: 'ZTC', decimals: 18 }, rpcUrls: ['https://zenchain-testnet.api.onfinality.io/public'], blockExplorerUrls: ['https://zentrace.io/'], };
let provider, signer, currentAccount;
let zgtTokenContract, swapContract, hubContract;
let lastCoinFlipChoice = true;

// =======================================
// INITIALIZATION
// =======================================
window.addEventListener('load', () => {
    document.getElementById('connectButton').addEventListener('click', connectWallet);

    document.querySelectorAll('.nav-btn').forEach(button => {
        button.addEventListener('click', handlePageNavigation);
    });

    initializePageScripts('lobby-page');
    
    if (typeof window.ethereum !== 'undefined') {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', () => window.location.reload());
    } else {
        Swal.fire({ icon: 'warning', title: 'MetaMask Not Found', text: 'Please install MetaMask to use this DApp!', theme: 'dark' });
    }
});

function handlePageNavigation(event) {
    const button = event.target;
    if (button.classList.contains('disabled')) return;
    
    const pageId = button.dataset.page + '-page';
    
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

    initializePageScripts(pageId);
}

function initializePageScripts(pageId) {
    if (pageId === 'lobby-page') {
        document.getElementById('depositButton').addEventListener('click', depositTokens);
        document.getElementById('withdrawButton').addEventListener('click', withdrawTokens);
    } else if (pageId === 'swap-page') {
        document.getElementById('swapZtcButton').addEventListener('click', swapZtcToZgt);
        document.getElementById('swapZgtButton').addEventListener('click', swapZgtToZtc);
    } else if (pageId === 'coinflip-page') {
        document.getElementById('betHeadsButton').addEventListener('click', () => playCoinFlip(true));
        document.getElementById('betTailsButton').addEventListener('click', () => playCoinFlip(false));
    }
}

// =======================================
// CORE FUNCTIONS
// =======================================
async function connectWallet() {
    try {
        if (!provider) {
             Swal.fire({ icon: 'error', title: 'Error', text: 'Ethereum provider is not available.', theme: 'dark' });
             return;
        }
        await provider.send("eth_requestAccounts", []);
        signer = provider.getSigner();
        currentAccount = await signer.getAddress();
        
        zgtTokenContract = new ethers.Contract(zgtTokenAddress, zgtTokenABI, signer);
        swapContract = new ethers.Contract(swapContractAddress, swapContractABI, signer);
        hubContract = new ethers.Contract(hubContractAddress, hubContractABI, signer);

        handleAccountsChanged([currentAccount]);
        listenToEvents();
    } catch (error) {
        console.error("Failed to connect wallet:", error);
    }
}

function handleAccountsChanged(accounts) {
    const connectButton = document.getElementById('connectButton');
    
    if (accounts.length === 0) {
        currentAccount = null;
        signer = null;
        connectButton.textContent = 'Connect Wallet';
        updateAllBalances();
    } else {
        currentAccount = accounts[0];
        connectButton.textContent = `${currentAccount.substring(0, 6)}...${currentAccount.substring(currentAccount.length - 4)}`;
        updateAllBalances();
    }
}

async function updateAllBalances() {
    const ztcBalanceSpan = document.getElementById('ztcBalance');
    const zgtBalanceSpan = document.getElementById('zgtBalance');
    const hubBalanceSpan = document.getElementById('hubBalance');

    if (!currentAccount) {
        ztcBalanceSpan.textContent = '0.0000';
        zgtBalanceSpan.textContent = '0.0000';
        hubBalanceSpan.textContent = '0.0000';
        return;
    }

    try {
        const rawZtcBalance = await provider.getBalance(currentAccount);
        ztcBalanceSpan.textContent = parseFloat(ethers.utils.formatEther(rawZtcBalance)).toFixed(4);
        
        const rawZgtBalance = await zgtTokenContract.balanceOf(currentAccount);
        zgtBalanceSpan.textContent = parseFloat(ethers.utils.formatEther(rawZgtBalance)).toFixed(4);
        
        const rawHubBalance = await hubContract.balances(currentAccount);
        hubBalanceSpan.textContent = parseFloat(ethers.utils.formatEther(rawHubBalance)).toFixed(4);
    } catch (error) {
        console.error("Failed to update balances:", error);
    }
}

async function approveSpender(spenderAddress, amountInWei) {
    if (!signer) {
        Swal.fire({ icon: 'info', title: 'Wallet Not Connected', text: 'Please connect your wallet first.', theme: 'dark' });
        return false;
    }
    try {
        const allowance = await zgtTokenContract.allowance(currentAccount, spenderAddress);
        if (allowance.lt(amountInWei)) {
            const tx = await zgtTokenContract.approve(spenderAddress, ethers.constants.MaxUint256);
            const pendingSwal = Swal.fire({ title: 'Approving...', text: 'Please wait for the approval transaction to be confirmed.', theme: 'dark', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
            await tx.wait();
            pendingSwal.close();
        }
        return true;
    } catch (error) {
        console.error("Approval failed:", error);
        Swal.fire({ icon: 'error', title: 'Approval Failed', text: error.reason || error.message, theme: 'dark' });
        return false;
    }
}

// =======================================
// HUB & SWAP FUNCTIONS
// =======================================
async function depositTokens() {
    if (!signer) return Swal.fire({ icon: 'info', title: 'Connect Wallet', text: 'Please connect your wallet first.', theme: 'dark' });
    const depositAmountInput = document.getElementById('depositAmount');
    const amount = depositAmountInput.value;
    if (!amount || parseFloat(amount) <= 0) return Swal.fire({ icon: 'info', title: 'Invalid Amount', text: 'Please enter a positive amount to deposit.', theme: 'dark' });
    const amountInWei = ethers.utils.parseEther(amount);
    const hasApproved = await approveSpender(hubContractAddress, amountInWei);
    if (!hasApproved) return;
    try {
        const tx = await hubContract.deposit(amountInWei);
        await tx.wait();
        Swal.fire({ icon: 'success', title: 'Deposit Successful!', theme: 'dark' });
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Deposit Failed', text: error.reason || error.message, theme: 'dark' });
    }
}

async function withdrawTokens() {
    if (!signer) return Swal.fire({ icon: 'info', title: 'Connect Wallet', text: 'Please connect your wallet first.', theme: 'dark' });
    const depositAmountInput = document.getElementById('depositAmount');
    const amount = depositAmountInput.value;
    if (!amount || parseFloat(amount) <= 0) return Swal.fire({ icon: 'info', title: 'Invalid Amount', text: 'Please enter a positive amount to withdraw.', theme: 'dark' });
    const amountInWei = ethers.utils.parseEther(amount);
    try {
        const tx = await hubContract.withdraw(amountInWei);
        await tx.wait();
        Swal.fire({ icon: 'success', title: 'Withdrawal Successful!', theme: 'dark' });
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Withdrawal Failed', text: error.reason || error.message, theme: 'dark' });
    }
}

async function swapZtcToZgt() {
    if (!signer) return Swal.fire({ icon: 'info', title: 'Connect Wallet', text: 'Please connect your wallet first.', theme: 'dark' });
    const ztcAmountInInput = document.getElementById('ztcAmountIn');
    const amount = ztcAmountInInput.value;
    if (!amount || parseFloat(amount) <= 0) return Swal.fire({ icon: 'info', title: 'Invalid Amount', text: 'Please enter a positive amount of ZTC to swap.', theme: 'dark' });
    const amountInWei = ethers.utils.parseEther(amount);
    try {
        const tx = await swapContract.swapZtcToZgt({ value: amountInWei });
        await tx.wait();
        await updateAllBalances();
        Swal.fire({ icon: 'success', title: 'Swap Successful!', text: 'You have received ZGT.', theme: 'dark' });
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Swap Failed', text: error.reason || error.message, theme: 'dark' });
    }
}

async function swapZgtToZtc() {
    if (!signer) return Swal.fire({ icon: 'info', title: 'Connect Wallet', text: 'Please connect your wallet first.', theme: 'dark' });
    const zgtAmountInInput = document.getElementById('zgtAmountIn');
    const amount = zgtAmountInInput.value;
    if (!amount || parseFloat(amount) <= 0) return Swal.fire({ icon: 'info', title: 'Invalid Amount', text: 'Please enter a positive amount of ZGT to swap.', theme: 'dark' });
    const amountInWei = ethers.utils.parseEther(amount);
    const hasApproved = await approveSpender(swapContractAddress, amountInWei);
    if (!hasApproved) return;
    try {
        const tx = await swapContract.swapZgtToZtc(amountInWei);
        await tx.wait();
        await updateAllBalances();
        Swal.fire({ icon: 'success', title: 'Swap Successful!', text: 'You have received ZTC.', theme: 'dark' });
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Swap Failed', text: error.reason || error.message, theme: 'dark' });
    }
}

// =======================================
// GAME & EVENT LISTENER FUNCTIONS
// =======================================
async function playCoinFlip(isHeads) {
    if (!signer) return Swal.fire({ icon: 'info', title: 'Connect Wallet', text: 'Please connect your wallet first.', theme: 'dark' });
    const coinFlipBetAmountInput = document.getElementById('coinFlipBetAmount');
    const amount = coinFlipBetAmountInput.value;
    if (!amount || parseFloat(amount) <= 0) return Swal.fire({ icon: 'info', title: 'Invalid Bet', text: 'Please enter a bet amount.', theme: 'dark' });
    lastCoinFlipChoice = isHeads;
    const amountInWei = ethers.utils.parseEther(amount);
    const coin = document.getElementById('coin');
    coin.style.transform = "rotateY(0deg)";
    coin.classList.add('flipping');
    try {
        const tx = await hubContract.playCoinFlip(amountInWei, isHeads);
        await tx.wait();
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'Game Failed', text: error.reason || error.message, theme: 'dark' });
        coin.classList.remove('flipping');
    }
}

function listenToEvents() {
    if (!hubContract || !swapContract) return;
    hubContract.on("Deposit", (user, amount) => { if (user.toLowerCase() === currentAccount.toLowerCase()) updateAllBalances(); });
    hubContract.on("Withdraw", (user, amount) => { if (user.toLowerCase() === currentAccount.toLowerCase()) updateAllBalances(); });
    swapContract.on("Swap", () => { updateAllBalances(); });
    hubContract.on("CoinFlipResult", (player, betAmount, won) => {
        if (player.toLowerCase() === currentAccount.toLowerCase()) {
            const coin = document.getElementById('coin');
            const winningSideIsHeads = (lastCoinFlipChoice && won) || (!lastCoinFlipChoice && !won);
            setTimeout(() => {
                coin.classList.remove('flipping');
                if (!winningSideIsHeads) {
                    coin.style.transform = "rotateY(180deg)";
                }
                if (won) {
                    Swal.fire({ icon: 'success', title: 'You Won!', text: `You won ${ethers.utils.formatEther(betAmount.mul(2))} ZGT!`, theme: 'dark' });
                } else {
                    Swal.fire({ icon: 'error', title: 'You Lost', text: `You lost ${ethers.utils.formatEther(betAmount)} ZGT.`, theme: 'dark' });
                }
                updateAllBalances();
            }, 2000);
        }
    });
}