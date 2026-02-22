const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRu2J4BrxvuOqtk0hs0H5RyLEy8xan-RW0ic_6lXQiWn-KZJDkEBAh-pO71AovTKPUPvieSch1-b7Ny/pub?output=csv';
const NAV_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRu2J4BrxvuOqtk0hs0H5RyLEy8xan-RW0ic_6lXQiWn-KZJDkEBAh-pO71AovTKPUPvieSch1-b7Ny/pub?gid=263826725&single=true&output=csv';

let navRows = []; 
let archiveData = []; // Stores the IDs and tags for quick filtering
let uniquePleats = new Set();
let uniqueTypes = new Set();
let uniqueSizes = new Set()

// Helper to turn "FANCY RAY" into "fancy-ray"
function slugify(text) {
    return text.toLowerCase().trim().replace(/\s+/g, '-');
}

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
        .map(row => {
            const rowData = {};
            headers.forEach((header, index) => {
                rowData[header] = (row[index] || '').trim();
            });
            return rowData;
        });
}

// --- THE SIZE DECODER ---
// Translates "S-L" or "S, M" into individual tags: ['s', 'm', 'l']
function parseSizes(sizeStr) {
    if (!sizeStr) return [];
    let str = sizeStr.toLowerCase().trim();
    let results = new Set();

    // 1. Expand the ranges
    if (str.includes('s-l')) { results.add('s'); results.add('m'); results.add('l'); }
    if (str.includes('s-m')) { results.add('s'); results.add('m'); }
    if (str.includes('m-l')) { results.add('m'); results.add('l'); }

    // 2. Catch standalone letters separated by commas or spaces
    let tokens = str.split(/[\s,-]+/);
    tokens.forEach(t => {
        if (t === 's') results.add('s');
        if (t === 'm') results.add('m');
        if (t === 'l') results.add('l');
    });

    // 3. Standardize all variants of "One Size"
    if (str.includes('uni') || str.includes('one') || str.includes('os') || str.includes('all')) {
        results.add('one size');
    }

    return Array.from(results);
}

// ---------------------------------------------------------
// 2. INIT SITE
// ---------------------------------------------------------
async function initSite() {
    try {
        const response = await fetch(NAV_SHEET_URL);
        const csvData = await response.text();
        const parsedNav = parseCSV(csvData);

        // Map Sheet Headers to Logic (REMOVED the filter so empty rows stay!)
        navRows = parsedNav.map(row => ({
            name: row['nav-name'] || '',          
            url:  row['url'] || row['nav-name'] || '', 
            type: row['type'] || 'text',    
            text: row['text'] || ''               
        })); 

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
        const li = document.createElement('li');
        li.className = 'nav-item';

        // --- 1. SPACER LOGIC (Preserve empty rows for layout) ---
        if (!item.name || item.name.trim() === '') {
            li.classList.add('spacer');
            li.innerHTML = '&nbsp;'; 
            li.style.pointerEvents = 'none'; 
            navList.appendChild(li);
            return; 
        }

        // Clean up the strings to prevent trailing space errors
        const nameStr = item.name.toLowerCase().trim();
        const typeStr = (item.type || '').toLowerCase().trim();
        
        // --- 2. VISUAL CONTENT & SECURE FILTER TAGGING ---
        if (nameStr === 'cart') {
            li.innerHTML = 'CART (<span class="snipcart-items-count">0</span>)';
            li.classList.add('nav-cart-item');
        } else if (typeStr === 'toggle' || nameStr === 'database') {
            const isDb = nameStr === 'database';
            li.innerHTML = `${item.name.toUpperCase()} <span class="circle">${isDb ? '●' : '○'}</span>`;
            if (isDb) {
                li.classList.add('active');
                databaseItemEl = li;
            }
        } else {
            li.textContent = item.name.toUpperCase();
            
            // NEW: If it's a filter, invisibly tag it so the Filter Engine can find it easily
            if (typeStr === 'filter') {
                li.setAttribute('data-is-filter-header', 'true');
                li.setAttribute('data-category-name', nameStr); 
            }
        }

        // --- 3. CLICK LISTENER ---
        li.addEventListener('click', (e) => {
            if (nameStr === 'cart') {
                e.preventDefault();
                closeOverlayAndReset();
                if (window.Snipcart) Snipcart.api.theme.cart.open();
                return;
            }

            if (typeStr === 'toggle') {
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
                if (item.url) window.location.hash = item.url;
                return;
            }

            // Default fallback
            closeOverlayAndReset();
        });

        navList.appendChild(li);
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
                pleat: piece['pleat'],
                type:  piece['type'],
                style: piece['style'],
                color: piece['color'],
                size:  piece['size'],
                price: piece['price'],
                material: piece['material'] || '',
                measurements: piece['measurements'] || '',
                sold:  piece['sold'], 
                img:   getDirectImgLink(piece[imgKey]) 
            };

            if (!p.id) return;

            // 1. Extract, split by comma, and format tags
            const itemPleats = p.pleat.split(',').map(t => t.trim()).filter(t => t);
            const itemTypes = p.type.split(',').map(t => t.trim()).filter(t => t);
            const itemSizes = parseSizes(p.size);

            // Add to our Sets for the Nav menu
            itemPleats.forEach(t => uniquePleats.add(t));
            itemTypes.forEach(t => uniqueTypes.add(t));
            itemSizes.forEach(t => uniqueSizes.add(t));
            
            // Save the slugified versions to our global array for the filtering engine
            archiveData.push({
                id: p.id,
                pleats: itemPleats.map(slugify),
                types: itemTypes.map(slugify),
                sizes: itemSizes.map(slugify)
            });

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

            // COMBINATION: "ID. PLEAT TYPE" (e.g., "01. ACCORDION SKIRT")
            const combinedTitle = [p.pleat, p.type].filter(Boolean).join(' ');
            iItemNode.querySelector('.p-id-name').textContent = `${p.id}. ${combinedTitle.toUpperCase()}`;

            // BRAND: New line (Make sure you have a class for this or repurpose an existing one)
            // If you don't have a .p-brand class in HTML, we can inject it into the title or a tag
            if (p.brand) {
                const brandSpan = document.createElement('div');
                brandSpan.className = 'p-brand'; // You can style this in CSS
                brandSpan.textContent = p.brand.toUpperCase();
                iItemNode.querySelector('.piece-header').appendChild(brandSpan);
            }

            iItemNode.querySelector('.p-price').textContent = p.price;
            iItemNode.querySelector('.p-size').textContent = p.size;
            

            const measContainer = iItemNode.querySelector('.p-measurements'); 
                if (measContainer) {
                    if (p.measurements) {
                        // Convert newlines from Sheet to HTML breaks
                        measContainer.innerHTML = p.measurements.replace(/\n/g, '<br>');
                        measContainer.style.display = 'block';
                    } else {
                        measContainer.style.display = 'none'; // Hide if empty
                    }
                }
                if (p.material) {
                const materialEl = document.createElement('span');
                materialEl.className = 'p-material';
                materialEl.textContent = p.material.toLowerCase(); 
                
                // Insert it immediately after the measurements container
                if (measContainer) {
                    measContainer.insertAdjacentElement('afterend', materialEl);
                }
            }

            // --- 3. SNIPCART BUTTON LOGIC ---
            const btn = iItemNode.querySelector('.add-btn');
            
            if (isSold) {
                iItemNode.classList.add('is-sold');
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

        buildFiltersUI();
        applyFilters();

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
// 7. SNIPCART EVENTS & PERSISTENCE
// ---------------------------------------------------------
document.addEventListener('snipcart.ready', () => {
    
    // Helper 1: Sync the visual state of the items
    function updateCartState(item, isAdded) {
        const btn = document.querySelector(`.add-btn[data-item-id="${item.id}"]`);
        if (btn) isAdded ? btn.classList.add('in-cart') : btn.classList.remove('in-cart');

        document.querySelectorAll(`[data-hover-id="${item.id}"]`).forEach(el => {
            isAdded ? el.classList.add('is-in-cart') : el.classList.remove('is-in-cart');
        });
    }

    // Helper 2: Toggle the CART nav button visibility
    function updateCartNav() {
        const cartNav = document.querySelector('.nav-cart-item');
        if (!cartNav) return;
        
        // Check how many items are currently in the cart
        const count = Snipcart.store.getState().cart.items.count;
        
        if (count > 0) {
            cartNav.classList.add('has-items');
        } else {
            cartNav.classList.remove('has-items');
        }
    }

    // A. Initial Check on Page Load
    const items = Snipcart.store.getState().cart.items.items;
    items.forEach(item => updateCartState(item, true));
    updateCartNav(); // Run nav check on load

    // B. When item is added
    Snipcart.events.on('item.added', (item) => {
        updateCartState(item, true);
        updateCartNav(); // Update nav
    });

    // C. When item is removed
    Snipcart.events.on('item.removed', (item) => {
        updateCartState(item, false);
        updateCartNav(); // Update nav
    });
});

// ---------------------------------------------------------
// 8. THE MASTER CLICK MANAGER
// ---------------------------------------------------------
document.addEventListener('click', (e) => {
    // 1. Let the "Add to Cart" button work without interference
    if (e.target.closest('.add-btn')) {
        return; 
    }

    // 2. Close cart drawer ONLY if clicking the background
    const snipcartModal = document.querySelector('.snipcart-modal');
    if (snipcartModal && !snipcartModal.contains(e.target)) {
        if (!e.target.closest('.nav-item')) {
            if (window.Snipcart) Snipcart.api.theme.cart.close();
        }
    }

    // 3. RESET FOCUS LOGIC
    if (document.body.classList.contains('item-is-clicked')) {
        const isClickingCurrentItem = e.target.closest('.selected-twin');
        
        // Only close if the click is truly outside the focused item
        if (!isClickingCurrentItem) {
            document.body.classList.remove('item-is-clicked');
            document.querySelectorAll('.selected-twin').forEach(el => {
                el.classList.remove('selected-twin');
            });
        }
        
        // CRITICAL: Always return here if we were in focus mode, 
        // so it doesn't immediately open the next item!
        return; 
    }

    // 4. ACTIVATE FOCUS
    // If not in focus mode, check if they clicked an item to open it
    const targetItem = e.target.closest('[data-hover-id]');
    if (targetItem) {
        const id = targetItem.getAttribute('data-hover-id');
        document.body.classList.add('item-is-clicked');
        document.querySelectorAll(`[data-hover-id="${id}"]`).forEach(el => {
            el.classList.add('selected-twin');
        });
    }
});

// ---------------------------------------------------------
// 10. THE FILTER ENGINE
// ---------------------------------------------------------

// A. Build the UI in the Nav (Bulletproof Version)
function buildFiltersUI() {
    // Only target the specific nav items we secretly tagged as filters
    const filterHeaders = document.querySelectorAll('.nav-item[data-is-filter-header="true"]');
    
    filterHeaders.forEach(navItem => {
        const catName = navItem.getAttribute('data-category-name'); // reads 'type', 'pleat', or 'size'
        let sourceSet, category;

        // Figure out which array of data to use
        if (catName.includes('pleat')) { 
            sourceSet = Array.from(uniquePleats); 
            category = 'pleat'; 
        } else if (catName.includes('type')) { 
            sourceSet = Array.from(uniqueTypes); 
            category = 'type'; 
        } else if (catName.includes('size')) { 
            const sizeOrder = ['s', 'm', 'l', 'one size'];
            sourceSet = Array.from(uniqueSizes).sort((a, b) => sizeOrder.indexOf(a) - sizeOrder.indexOf(b));
            category = 'size'; 
        } else {
            return; // Skip if it's an unrecognized filter category
        }
        
        const filterList = document.createElement('ul');
        filterList.className = 'filter-list';

        // Build the actual tags
        sourceSet.forEach(tagText => {
            const li = document.createElement('li');
            li.className = 'filter-tag';
            li.textContent = tagText.toLowerCase();
            li.setAttribute('data-category', category);
            li.setAttribute('data-slug', slugify(tagText));
            
            li.onclick = (e) => {
                e.stopPropagation();
                updateFilterHash(category, slugify(tagText));
            };
            
            filterList.appendChild(li);
        });

        // Add the clear button
        const clearBtn = document.createElement('div');
        clearBtn.className = 'clear-filters-btn';
        clearBtn.textContent = 'clear filter x';
        clearBtn.setAttribute('data-clear-category', category); 
        
        clearBtn.onclick = (e) => {
            e.stopPropagation();
            updateFilterHash(category, null); 
        };

        navItem.appendChild(filterList);
        navItem.appendChild(clearBtn);
    });
}

// B. Update the URL Hash (e.g. #filter?type=pant&pleat=flat)
function updateFilterHash(category, slug) {
    const params = new URLSearchParams(window.location.hash.replace('#filter?', ''));
    
    if (slug) {
        params.set(category, slug); // Adds or replaces the current one
    } else {
        params.delete(category); // Clears it if they click "clear x"
    }

    const newHash = params.toString();
    window.location.hash = newHash ? `#filter?${newHash}` : '';
}

// C. Read the URL and Apply the Ghosts & Auto-Scroll
function applyFilters() {
    const params = new URLSearchParams(window.location.hash.replace('#filter?', ''));
    const activePleat = params.get('pleat');
    const activeType = params.get('type');
    const activeSize = params.get('size'); 
    
    const isFiltering = activePleat || activeType || activeSize;

    // 1. Update Nav UI Highlights
    document.querySelectorAll('.filter-tag').forEach(tag => {
        const isMatch = (tag.getAttribute('data-category') === 'pleat' && tag.getAttribute('data-slug') === activePleat) ||
                        (tag.getAttribute('data-category') === 'type' && tag.getAttribute('data-slug') === activeType) ||
                        (tag.getAttribute('data-category') === 'size' && tag.getAttribute('data-slug') === activeSize); 
        tag.classList.toggle('active', isMatch);
    });

    // 2. Toggle Individual Clear Buttons
    document.querySelectorAll('.clear-filters-btn').forEach(btn => {
        const cat = btn.getAttribute('data-clear-category');
        if ((cat === 'pleat' && activePleat) || (cat === 'type' && activeType) || (cat === 'size' && activeSize)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 3. Apply the .is-filtered-out class to the grids
    archiveData.forEach(item => {
        let isMatch = true;

        if (activePleat && !item.pleats.includes(activePleat)) isMatch = false;
        if (activeType && !item.types.includes(activeType)) isMatch = false;
        if (activeSize && !item.sizes.includes(activeSize)) isMatch = false; 

        const elements = document.querySelectorAll(`[data-hover-id="${item.id}"]`);
        
        elements.forEach(el => {
            // A: Tag the true matches specifically for the auto-scroller
            if (isFiltering && isMatch) {
                el.classList.add('is-filter-match');
            } else {
                el.classList.remove('is-filter-match');
            }

            // B: Handle the visual ghosting (with Sold Immunity)
            if (el.classList.contains('is-sold')) return; 

            if (isFiltering && !isMatch) {
                el.classList.add('is-filtered-out');
            } else {
                el.classList.remove('is-filtered-out');
            }
        });
    });

    // 4. AUTO-SCROLL TO THE FIRST MATCHING ITEM
    setTimeout(() => {
        const infoGrid = document.getElementById('info-grid');
        // If filtering, look for our exact match class. If not filtering, just look for any piece-unit (resets to top).
        const scrollTargetClass = isFiltering ? '.is-filter-match' : '.piece-unit';

        if (infoGrid) {
            const firstVisibleInfo = infoGrid.querySelector(scrollTargetClass);
            infoGrid.scrollTo({
                top: firstVisibleInfo ? firstVisibleInfo.offsetTop - 10 : 0, 
                behavior: 'smooth'
            });
        }

        const visualCols = document.querySelectorAll('.visual-scroll-column');
        visualCols.forEach(col => {
            const firstVisibleImg = col.querySelector(scrollTargetClass);
            col.scrollTo({
                top: firstVisibleImg ? firstVisibleImg.offsetTop - 10 : 0,
                behavior: 'smooth'
            });
        });
    }, 50);
}

// D. Listeners
window.addEventListener('hashchange', applyFilters);

// ---------------------------------------------------------
// 11. FOCUS MODE IMAGE MAGNIFIER
// ---------------------------------------------------------

// 1. Inject the lens into the page
const magnifier = document.createElement('div');
magnifier.className = 'magnifier-lens';
document.body.appendChild(magnifier);

const ZOOM_LEVEL = 4; // How much it zooms in (2 = 200%, 3 = 300%)

// 2. Track the mouse
document.addEventListener('mousemove', (e) => {
    // Only work if Focus Mode is active
    if (!document.body.classList.contains('item-is-clicked')) {
        magnifier.classList.remove('active');
        return;
    }

    // Check if we are hovering exactly over the focused image
    const img = e.target.closest('.selected-twin img');
    
    if (!img) {
        magnifier.classList.remove('active');
        return;
    }

    // 3. Activate the lens and match the image
    magnifier.classList.add('active');

    if (magnifier.style.backgroundImage !== `url("${img.src}")`) {
        magnifier.style.backgroundImage = `url("${img.src}")`;
    }

    // Set the zoom size based on the physical image width
    const rect = img.getBoundingClientRect();
    magnifier.style.backgroundSize = `${rect.width * ZOOM_LEVEL}px ${rect.height * ZOOM_LEVEL}px`;

    // Calculate mouse position relative to the image itself
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Center the lens directly on the mouse cursor
    magnifier.style.left = `${e.clientX - 125}px`; // 125 is half of the 250px width
    magnifier.style.top = `${e.clientY - 125}px`;

    // Shift the background image mathematically so the exact pixel hovered is centered
    const bgX = (x / rect.width) * 100;
    const bgY = (y / rect.height) * 100;
    magnifier.style.backgroundPosition = `${bgX}% ${bgY}%`;
});