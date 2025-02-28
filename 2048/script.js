const boardSize = 4;
const board = [];
let hasWon = false;

function initializeBoard() {
    const gameBoard = document.getElementById('game-board');
    for (let i = 0; i < boardSize; i++) {
        board[i] = [];
        for (let j = 0; j < boardSize; j++) {
            const tile = document.createElement('div');
            tile.classList.add('tile');
            gameBoard.appendChild(tile);
            board[i][j] = tile;
        }
    }
    addRandomTile();
    addRandomTile();
}

function addRandomTile() {
    const emptyTiles = [];
    for (let i = 0; i < boardSize; i++) {
        for (let j = 0; j < boardSize; j++) {
            if (!board[i][j].textContent) {
                emptyTiles.push({ row: i, col: j });
            }
        }
    }
    if (emptyTiles.length === 0) return;
    const randomTile = emptyTiles[Math.floor(Math.random() * emptyTiles.length)];
    board[randomTile.row][randomTile.col].textContent = Math.random() > 0.9 ? 4 : 2;
    board[randomTile.row][randomTile.col].classList.add(`tile-${board[randomTile.row][randomTile.col].textContent}`);
}

function moveTiles(direction) {
    // Implement tile movement logic based on direction (up, down, left, right)
    // This is a simplified version and needs to be expanded for full functionality
    console.log(`Moving tiles ${direction}`);
}

document.addEventListener('keydown', (e) => {
    switch (e.key) {
        case 'ArrowUp':
            moveTiles('up');
            break;
        case 'ArrowDown':
            moveTiles('down');
            break;
        case 'ArrowLeft':
            moveTiles('left');
            break;
        case 'ArrowRight':
            moveTiles('right');
            break;
    }
    addRandomTile();
    checkWin();
});

function checkWin() {
    for (let i = 0; i < boardSize; i++) {
        for (let j = 0; j < boardSize; j++) {
            if (board[i][j].textContent === '2048') {
                alert('You Win!');
                hasWon = true;
            }
        }
    }
}

initializeBoard();