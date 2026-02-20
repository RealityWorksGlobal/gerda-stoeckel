const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRu2J4BrxvuOqtk0hs0H5RyLEy8xan-RW0ic_6lXQiWn-KZJDkEBAh-pO71AovTKPUPvieSch1-b7Ny/pub?output=csv';
const NAV_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRu2J4BrxvuOqtk0hs0H5RyLEy8xan-RW0ic_6lXQiWn-KZJDkEBAh-pO71AovTKPUPvieSch1-b7Ny/pub?gid=263826725&single=true&output=csv';

let navRows = []; 

// ---------------------------------------------------------
// 1. ROBUST CSV PARSER (Handles Newlines & Spaces)
// ---------------------------------------------------------
function parseCSV(csvText) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const c = csvText[i];
        const nextC = csvText[i + 1];

        // 1. Handle escaped quotes ("") inside a quoted string
        if (c === '"' && inQuotes && nextC === '"') {
            currentCell += '"';
            i++; // Skip the second quote
        } 
        // 2. Toggle quote state on/off
        else if (c === '"') {
            inQuotes = !inQuotes;
        } 
        // 3. Comma outside of quotes means end of cell
        else if (c === ',' && !inQuotes) {
            currentRow.push(currentCell);
            currentCell = '';
        } 
        // 4. Newline outside of quotes means end of row
        else if ((c === '\n' || c === '\r') && !inQuotes) {
            if (c === '\r' && nextC === '\n') i++; // Handle Windows \r\n
            currentRow.push(currentCell);
            rows.push(currentRow);
            currentRow = [];
            currentCell = '';
        } 
        // 5. Everything else is just regular text!
        else {
            currentCell += c;
        }
    }
    
    // Catch the very last cell/row if the file doesn't end with a newline
    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
    }

    if (rows.length < 2) return [];

    // Map the cleaned rows to your headers
    const headers = rows[0].map(h => h.trim().toLowerCase());
    
    return rows.slice(1)
        .filter(r => r.join('').trim() !== '') // Skip totally empty rows
        .map(row => {
            const rowData = {};
            headers.forEach((header, index) => {
                rowData[header] = (row[index] || '').trim();
            });
            return rowData;
        });
}

// ---------------------------------------------------------
// 2. INIT SITE
// ---------------------------------------------------------
async function initSite() {
    try {
        const response = await fetch(NAV_SHEET_URL);
        const csvData = await response.text();
        const parsedNav = parseCSV(csvData);

        // Map Sheet Headers to Logic
        navRows = parsedNav.map(row => ({
            name: row['nav-name'],          // Must match header "nav-name"
            url:  row['url'] || row['nav-name'], 
            type: row['type'] || 'text',    
            text: row['text']               
        })).filter(r => r.name); // Filter out empty rows

        buildNavMenu();
        await initDatabase(); 

    } catch (err) {
        console.error("Site Init Error:", err);
    }
}

// ---------------------------------------------------------
// 3. BUILD MENU (Cleaned & Consolidated)
// ---------------------------------------------------------
function buildNavMenu() {
    const navList = document.getElementById('nav-list');
    const overlay = document.getElementById('overlay-curtain');
    const overlayContent = document.getElementById('overlay-content');

    navList.innerHTML = '';
    let databaseItemEl = null; 

    function closeOverlayAndReset() {
        overlay.classList.remove('active');
        window.location.hash = ''; 
        
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.remove('active');
            const circle = el.querySelector('.circle');
            if (circle) circle.textContent = '○';
        });

        if (databaseItemEl) {
            databaseItemEl.classList.add('active');
            const dbCircle = databaseItemEl.querySelector('.circle');
            if (dbCircle) dbCircle.textContent = '●';
        }
    }

    navRows.forEach(item => {
        if (!item.name) return;

        const name = item.name.toLowerCase();
        const type = (item.type || '').toLowerCase();
        const li = document.createElement('li');
        li.className = 'nav-item';

        const isToggleOrDb = (type === 'toggle' || name === 'database');
        
        // --- 1. SET THE VISUAL CONTENT (Cleaned up!) ---
        if (name === 'cart') {
            // Inject the magic Snipcart counter
            li.innerHTML = 'CART (<span class="snipcart-items-count">0</span>)';
        } else if (isToggleOrDb) {
            // Inject the name and the circle for toggles/database
            li.innerHTML = `${item.name.toUpperCase()} <span class="circle">○</span>`;
        } else {
            // Standard links
            li.textContent = item.name.toUpperCase();
        }

        if (name === 'database') databaseItemEl = li;

        // --- 2. SINGLE CONSOLIDATED CLICK LISTENER ---
        li.addEventListener('click', (e) => {
            // Handle Snipcart
            if (name === 'cart') {
                e.preventDefault();
                closeOverlayAndReset();
                if (window.Snipcart) Snipcart.api.theme.cart.open();
                return; // Don't do anything else
            }

            // Handle Database reset
            if (name === 'database') {
                closeOverlayAndReset();
                return;
            }

            // Handle Overlay Toggles (About, Shipping, etc)
            if (type === 'toggle') {
                document.querySelectorAll('.nav-item').forEach(el => {
                    el.classList.remove('active');
                    const circle = el.querySelector('.circle');
                    if (circle) circle.textContent = '○';
                });
                
                li.classList.add('active');
                const myCircle = li.querySelector('.circle');
                if (myCircle) myCircle.textContent = '●';

                overlayContent.innerHTML = (item.text || '').replace(/\n/g, '<br>');
                overlay.classList.add('active');
                overlay.scrollTop = 0; 
                if(item.url) window.location.hash = item.url;
            } else {
                // If it's a generic link, just reset
                closeOverlayAndReset();
            }
        });

        navList.appendChild(li);

        // --- 3. SET INITIAL DATABASE STATE ---
        if (name === 'database') {
            li.classList.add('active');
            const circle = li.querySelector('.circle');
            if (circle) circle.textContent = '●';
        }
    });

    // Close on background click
    document.addEventListener('click', (event) => {
        if (overlay.classList.contains('active')) {
            const clickedOutsideText = !overlayContent.contains(event.target);
            const clickedOutsideNav = !navList.contains(event.target);
            if (clickedOutsideText && clickedOutsideNav) {
                closeOverlayAndReset();
            }
        }
    });
}

// ---------------------------------------------------------
// 4. IMAGE HELPER (Stayed the same)
// ---------------------------------------------------------
function getDirectImgLink(url) {
    if (!url || !url.includes('drive.google.com')) return url;
    const idMatch = url.match(/\/d\/(.+?)\//) || url.match(/id=(.+?)(&|$)/);
    return idMatch ? `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=s4000` : url;
}

// ---------------------------------------------------------
// 5. DATABASE (Fixed & Consolidated)
// ---------------------------------------------------------
async function initDatabase() {
    const safetyTimer = setTimeout(() => {
        const loader = document.getElementById('loading-screen');
        if (loader && !loader.classList.contains('loader-hidden')) {
            loader.classList.add('loader-hidden');
            setTimeout(() => { loader.style.display = 'none'; }, 800);
        }
    }, 5000);

    try {
        const response = await fetch(SHEET_URL);
        const csvData = await response.text();
        const products = parseCSV(csvData);

        const visualGrid = document.getElementById('visual-grid');
        const infoGrid = document.getElementById('info-grid'); 
        const vTemplate = document.getElementById('visual-template');
        const iTemplate = document.getElementById('info-template');

        const headers = Object.keys(products[0] || {});
        const imgKey = headers.find(h => h.includes('thumbnail'));
        
        let totalImages = 0;
        let imagesLoaded = 0;
        
        const checkProgress = () => {
            imagesLoaded++;
            if (imagesLoaded >= totalImages) {
                clearTimeout(safetyTimer);
                const loader = document.getElementById('loading-screen');
                if (loader) {
                    loader.classList.add('loader-hidden');
                    setTimeout(() => { loader.style.display = 'none'; }, 800);
                }
            }
        };

        products.forEach(p => { if (p[imgKey] && p[imgKey].trim() !== "") totalImages++; });
        if (totalImages === 0) document.getElementById('loading-screen').style.display = 'none';
        
        const visualElements = []; 

        products.forEach((piece) => {
            const p = {
                id:    piece['id'],
                name:  piece['name'],
                type:  piece['type'],
                style: piece['style'],
                color: piece['color'],
                size:  piece['size'],
                price: piece['price'],
                sold:  piece['sold'], // Added this
                img:   getDirectImgLink(piece[imgKey]) 
            };

            if (!p.id) return;

            const isSold = p.sold && p.sold.toLowerCase() === 'yes';

            // --- 1. VISUAL GRID ELEMENT ---
            const vClone = vTemplate.content.cloneNode(true);
            const vItemNode = vClone.firstElementChild;
            vItemNode.querySelector('.piece-id').textContent = `${p.id}.`;
            
            const imgEl = vItemNode.querySelector('.piece-img');
            if (p.img) {
                imgEl.src = p.img;
                imgEl.onload = checkProgress;
                imgEl.onerror = checkProgress; 
            } else {
                imgEl.remove();
            }

            if (isSold) {
                vItemNode.classList.add('is-sold'); // This triggers the CSS blur
            }

            vItemNode.setAttribute('data-hover-id', p.id); 
            visualElements.push(vItemNode);

            // --- 2. INFO GRID ELEMENT ---
            const iClone = iTemplate.content.cloneNode(true);
            const iItemNode = iClone.firstElementChild;
            if (isSold) {
                iItemNode.classList.add('is-sold');
            }
            
            iItemNode.querySelector('.p-id-name').textContent = `${p.id}. ${p.name}`;
            iItemNode.querySelector('.p-price').textContent = p.price;
            iItemNode.querySelector('.p-size').textContent = p.size;
            
            const tagContainer = iItemNode.querySelector('.tag-list');
            [p.color, p.type, p.style].forEach(tag => {
                if (tag) {
                    const span = document.createElement('span');
                    span.className = 'tag-item';
                    span.textContent = tag;
                    tagContainer.appendChild(span);
                }
            });

            // --- 3. SNIPCART BUTTON LOGIC ---
            const btn = iItemNode.querySelector('.add-btn');
            
            if (isSold) {
                // If SOLD: Disable button and change appearance
                btn.textContent = 'SOLD';
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
                btn.className = 'add-btn sold-out'; // Remove Snipcart class
            } else {
                // If AVAILABLE: Setup Snipcart
                btn.className = 'add-btn snipcart-add-item'; 
                btn.setAttribute('data-item-id', p.id);
                btn.setAttribute('data-item-name', p.name);
                
                let cleanPrice = p.price ? parseFloat(p.price.toString().replace(/[^0-9.]/g, '')) : 0;
                let finalPrice = isNaN(cleanPrice) ? '0.00' : cleanPrice.toFixed(2);
                
                btn.setAttribute('data-item-price', finalPrice);
                btn.setAttribute('data-item-url', window.location.origin + window.location.pathname);
                btn.setAttribute('data-item-image', p.img);
                btn.setAttribute('data-item-description', `${p.style} ${p.type}`);
            }

            iItemNode.setAttribute('data-hover-id', p.id);
            infoGrid.appendChild(iItemNode);
        });

        // --- 4. LAYOUT LOGIC ---
        const MIN_COL_WIDTH = 250; 
        const MAX_COLS = 3;        

        function layoutVisualGrid() {
            visualGrid.innerHTML = ''; 
            const gridWidth = visualGrid.offsetWidth || window.innerWidth / 2;
            let numCols = Math.floor(gridWidth / MIN_COL_WIDTH);
            if (numCols > MAX_COLS) numCols = MAX_COLS;
            if (numCols < 1) numCols = 1;

            const columns = [];
            for (let i = 0; i < numCols; i++) {
                const col = document.createElement('div');
                col.className = 'visual-scroll-column';
                visualGrid.appendChild(col);
                columns.push(col);
            }

            const itemsPerCol = Math.ceil(visualElements.length / numCols);
            visualElements.forEach((el, index) => {
                const safeColIndex = Math.min(Math.floor(index / itemsPerCol), numCols - 1); 
                columns[safeColIndex].appendChild(el);
            });
        }

        layoutVisualGrid();
        window.addEventListener('resize', layoutVisualGrid);

    } catch (err) {
        console.error("Gerda Database Error:", err);
        document.getElementById('loading-screen').style.display = 'none';
    }
}

// Kick off the site
initSite();

// ---------------------------------------------------------
// 6. CROSS-GRID RAW AUTO-SCROLL 
// ---------------------------------------------------------

document.addEventListener('mouseover', (e) => {
    // --- NEW: THE FOCUS LOCK ---
    // If an item has been clicked and we are in focus mode, completely ignore all hovers!
    if (document.body.classList.contains('item-is-clicked')) return;

    const target = e.target.closest('[data-hover-id]');
    if (!target) return; 

    const id = target.getAttribute('data-hover-id');
    const twins = document.querySelectorAll(`[data-hover-id="${id}"]`);

    twins.forEach(twin => {
        if (twin !== target) {
            const container = twin.closest('.visual-scroll-column') || twin.closest('#info-grid');
            
            if (container) {
                const targetScrollTop = twin.offsetTop - (container.clientHeight / 2) + (twin.clientHeight / 2);
                
                container.scrollTo({
                    top: targetScrollTop,
                    behavior: 'smooth' 
                });
            }
        }
    });
});

// ---------------------------------------------------------
// 7. CLICK-TO-FOCUS & BLUR LOGIC
// ---------------------------------------------------------

document.addEventListener('click', (e) => {
    
    // --- 1. IF ALREADY FOCUSED: ANY CLICK EXITS FOCUS MODE ---
    if (document.body.classList.contains('item-is-clicked')) {
        // Remove the global blur state
        document.body.classList.remove('item-is-clicked');
        
        // Remove the sharpness from the twins
        document.querySelectorAll('.selected-twin').forEach(el => {
            el.classList.remove('selected-twin');
        });
        
        return; // STOP HERE! This prevents jumping straight to a new item.
    }

    // --- 2. IF NOT FOCUSED: CHECK IF THEY CLICKED AN ITEM ---
    const targetItem = e.target.closest('[data-hover-id]');

    if (targetItem) {
        const id = targetItem.getAttribute('data-hover-id');
        
        // Turn on the global blur state and lock the hover
        document.body.classList.add('item-is-clicked');
        
        // Make the clicked item and its twin perfectly sharp
        document.querySelectorAll(`[data-hover-id="${id}"]`).forEach(el => {
            el.classList.add('selected-twin');
        });
    }
})

// ---------------------------------------------------------
// 8. SNIPCART: CLICK-AWAY TO CLOSE (Fixed!)
// ---------------------------------------------------------
document.addEventListener('click', (event) => {
    // Find the cart modal in the DOM (Snipcart only mounts this when it's open)
    const snipcartModal = document.querySelector('.snipcart-modal');
    
    // If the modal isn't currently open/on the screen, stop here.
    if (!snipcartModal) return;

    // 1. Did they click inside the actual cart drawer?
    if (snipcartModal.contains(event.target)) return;
    
    // 2. Did they click an "ADD TO CART" button? 
    if (event.target.closest('.snipcart-add-item')) return;
    
    // 3. Did they click a Nav button (like "CART")?
    if (event.target.closest('.nav-item')) return;

    // If we made it this far, they clicked the background or the image grid!
    // Force Snipcart to snap shut.
    if (window.Snipcart) {
        Snipcart.api.theme.cart.close();
    }
});