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
// 3. BUILD MENU (With Type Logic)
// ---------------------------------------------------------
function buildNavMenu() {
    const navList = document.getElementById('nav-list');
    const overlay = document.getElementById('overlay-curtain');
    const overlayContent = document.getElementById('overlay-content');

    navList.innerHTML = '';
    
    // We will save the database element here so we can easily reset to it later
    let databaseItemEl = null; 

    // --- HELPER FUNCTION: Close overlay and reset visuals to Database ---
    function closeOverlayAndReset() {
        overlay.classList.remove('active');
        window.location.hash = ''; // Clear hash
        
        // Wipe all active states and make circles empty
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.remove('active');
            const circle = el.querySelector('.circle');
            if (circle) circle.textContent = '○';
        });

        // Turn 'database' back on
        if (databaseItemEl) {
            databaseItemEl.classList.add('active');
            const dbCircle = databaseItemEl.querySelector('.circle');
            if (dbCircle) dbCircle.textContent = '●';
        }
    }

    // --- LOOP THROUGH NAV ITEMS ---
    navRows.forEach(item => {
        if (!item.name) return;

        const name = item.name.toLowerCase();
        const type = (item.type || '').toLowerCase();
        
        const li = document.createElement('li');
        li.className = 'nav-item';

        // 1. VISUALS: Failsafe to guarantee 'database' gets a circle even if the sheet lags
        const isToggleOrDb = (type === 'toggle' || name === 'database');

        if (isToggleOrDb) {
            li.innerHTML = `${item.name} <span class="circle">○</span>`;
        } else {
            li.innerHTML = `${item.name}`; // No circle for cart, filter, sort
        }

        // Save reference to the database list item for our reset function
        if (name === 'database') {
            databaseItemEl = li;
        }

        // 2. CLICK BEHAVIOR
        li.addEventListener('click', () => {
            
            if (isToggleOrDb) {
                // If it's the database, just close everything
                if (name === 'database') {
                    closeOverlayAndReset(); 
                } else {
                    // Update visuals for clicked toggle
                    document.querySelectorAll('.nav-item').forEach(el => {
                        el.classList.remove('active');
                        const circle = el.querySelector('.circle');
                        if (circle) circle.textContent = '○';
                    });
                    
                    li.classList.add('active');
                    const myCircle = li.querySelector('.circle');
                    if (myCircle) myCircle.textContent = '●';

                    // Open the overlay for about, contact, etc.
                    overlayContent.innerHTML = (item.text || '').replace(/\n/g, '<br>');
                    overlay.classList.add('active');
                    overlay.scrollTop = 0; 
                    if(item.url) window.location.hash = item.url;
                }
            } else {
            
                closeOverlayAndReset();
            }
        });

        if (item.name.toLowerCase() === 'cart') {
            li.addEventListener('click', () => {
                // This is the native Snipcart command to open the side-panel
                Snipcart.api.theme.cart.open();
            });
        }

        navList.appendChild(li);

        // Auto-select "database" on initial Load
        if (name === 'database') {
            li.classList.add('active');
            const circle = li.querySelector('.circle');
            if (circle) circle.textContent = '●';
        }
    });

    // Listens for a click specifically on the background curtain, not the text inside
    document.addEventListener('click', (event) => {
        // Only trigger if the pop-up is currently active/open
        if (overlay.classList.contains('active')) {
            
            // Did they click outside the text zone?
            const clickedOutsideText = !overlayContent.contains(event.target);
            // Did they click outside the navigation menu? (We don't want to interfere with menu clicks)
            const clickedOutsideNav = !navList.contains(event.target);

            if (clickedOutsideText && clickedOutsideNav) {
                closeOverlayAndReset();
            }
        }
    });
}

// ---------------------------------------------------------
// 4. IMAGE HELPER
// ---------------------------------------------------------
function getDirectImgLink(url) {
    if (!url || !url.includes('drive.google.com')) return url;
    const idMatch = url.match(/\/d\/(.+?)\//) || url.match(/id=(.+?)(&|$)/);
    return idMatch ? `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=s4000` : url;
}

// ---------------------------------------------------------
// 5. DATABASE
// ---------------------------------------------------------
async function initDatabase() {
    // 1. SAFETY TIMEOUT: Force hide loader after 5 seconds if images hang
    const safetyTimer = setTimeout(() => {
        const loader = document.getElementById('loading-screen');
        if (loader && !loader.classList.contains('loader-hidden')) {
            console.warn("Gerda: Loader forced to hide (timeout). Check image links.");
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
            // Debugging: View progress in your console
            console.log(`Gerda Load Progress: ${imagesLoaded}/${totalImages}`);
            
            if (imagesLoaded >= totalImages) {
                clearTimeout(safetyTimer); // Cancel safety timer if we finish early
                const loader = document.getElementById('loading-screen');
                if (loader) {
                    loader.classList.add('loader-hidden');
                    setTimeout(() => { loader.style.display = 'none'; }, 800);
                }
            }
        };

        // Pass 1: Count valid images
        products.forEach(p => { if (p[imgKey] && p[imgKey].trim() !== "") totalImages++; });
        
        if (totalImages === 0) {
            clearTimeout(safetyTimer);
            document.getElementById('loading-screen').style.display = 'none';
        }
        
        const visualElements = []; 
        
        // Pass 2: Build Elements
        products.forEach((piece) => {
            const p = {
                id:    piece['id'],
                name:  piece['name'],
                type:  piece['type'],
                style: piece['style'],
                color: piece['color'],
                size:  piece['size'],
                price: piece['price'],
                img:   getDirectImgLink(piece[imgKey]) 
            };

            if (!p.id) return;

            // --- VISUAL SETUP ---
            const vClone = vTemplate.content.cloneNode(true);
            vClone.querySelector('.piece-id').textContent = `${p.id}.`;
            const imgEl = vClone.querySelector('.piece-img');
            
            if (p.img) {
                imgEl.src = p.img;
                imgEl.alt = p.name;
                imgEl.onload = checkProgress;
                imgEl.onerror = checkProgress; // Don't hang on broken links
            } else {
                imgEl.remove();
            }
            
            const itemNode = vClone.firstElementChild;
            itemNode.setAttribute('data-hover-id', p.id); 
            visualElements.push(itemNode);

            // --- INFO SETUP ---
            const iClone = iTemplate.content.cloneNode(true);
            iClone.querySelector('.p-id-name').textContent = `${p.id}. ${p.name}`;
            iClone.querySelector('.p-price').textContent = p.price;
            iClone.querySelector('.p-size').textContent = p.size;
            
            const tagContainer = iClone.querySelector('.tag-list');
            [p.color, p.type, p.style].forEach(tag => {
                if (tag) {
                    const span = document.createElement('span');
                    span.className = 'tag-item';
                    span.textContent = tag;
                    tagContainer.appendChild(span);
                }
            });

            // --- SNIPCART BUTTON SETUP ---
            const btn = iClone.querySelector('.add-btn');
            btn.className = 'add-btn snipcart-add-item'; // Required class
            btn.setAttribute('data-item-id', p.id);
            btn.setAttribute('data-item-name', p.name);
            // Clean price for Snipcart (removes CHF/$, keeps numbers)
            btn.setAttribute('data-item-price', p.price ? p.price.replace(/[^0-9.]/g, '') : '0');
            btn.setAttribute('data-item-url', window.location.origin + window.location.pathname);
            btn.setAttribute('data-item-image', p.img);
            btn.setAttribute('data-item-description', `${p.style} ${p.type} in ${p.color}`);

            const infoItemNode = iClone.firstElementChild;
            if (infoItemNode) {
                infoItemNode.setAttribute('data-hover-id', p.id);
            }
            infoGrid.appendChild(iClone);
        });

        // --- LAYOUT LOGIC ---
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
                const targetColIndex = Math.floor(index / itemsPerCol);
                const safeColIndex = Math.min(targetColIndex, numCols - 1); 
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