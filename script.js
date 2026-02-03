const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRu2J4BrxvuOqtk0hs0H5RyLEy8xan-RW0ic_6lXQiWn-KZJDkEBAh-pO71AovTKPUPvieSch1-b7Ny/pub?output=csv';


//========================================
//  PIECES DATABASE FUNCTION
//========================================
async function initDatabase() {
    try {
        const response = await fetch(SHEET_URL);
        const data = await response.text();
        const rows = data.split(/\r?\n/).filter(row => row.trim() !== "").slice(1); 

        const visualGrid = document.getElementById('visual-grid');
        const infoGrid = document.getElementById('info-grid');

        rows.forEach((row) => {
            // Robust regex to handle commas inside quoted cells
            const col = row.match(/(".*?"|[^",\r\n]+|(?<=,|^)(?=,|$))/g);
            
            if (col && col.length > 1) {
                const clean = (val) => val ? val.replace(/^"|"$/g, "").trim() : "";

                const piece = {
                    id: clean(col[0]),      // A
                    name: clean(col[1]),    // B
                    pleat: clean(col[2]),   // C
                    type: clean(col[3]),    // D
                    style: clean(col[4]),   // E
                    color: clean(col[5]),   // F
                    size: clean(col[6]),    // G
                    price: clean(col[7]),   // H
                    img: clean(col[11])     // L (Updated to index 11 for images)
                };

                if (piece.id && piece.name) {
                    // 1. VISUAL BLOCK
                    visualGrid.innerHTML += `
                        <div class="piece-unit">
                            <span class="piece-id">${piece.id}.</span>
                            ${piece.img ? `<img src="${piece.img}" alt="${piece.name}">` : ''}
                        </div>`;

                    // 2. INFO BLOCK (Gnuhr Structure)
                    infoGrid.innerHTML += `
                        <div class="piece-unit">
                            <div class="piece-header">
                                <span>${piece.id}. ${piece.name}</span>
                                <span>${piece.price}</span>
                            </div>
                            
                            <div class="tag-list">
                                ${piece.color ? `<span class="tag-item">${piece.color}</span>` : ''}
                                ${piece.type ? `<span class="tag-item">${piece.type}</span>` : ''}
                                ${piece.style ? `<span class="tag-item">${piece.style}</span>` : ''}
                            </div>

                            <div class="piece-footer">
                                <span class="p-size">${piece.size}</span>
                                <button class="snipcart-add-item add-btn"
                                    data-item-id="${piece.id}"
                                    data-item-name="${piece.name}"
                                    data-item-price="${piece.price.replace(/[^0-9.]/g, '')}"
                                    data-item-url="${window.location.href}"
                                    data-item-image="${piece.img}">
                                    ADD TO CART
                                </button>
                            </div>
                        </div>`;
                }
            }
        });
    } catch (err) {
        console.error("Connection failed", err);
    }
}

initDatabase();