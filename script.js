const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRu2J4BrxvuOqtk0hs0H5RyLEy8xan-RW0ic_6lXQiWn-KZJDkEBAh-pO71AovTKPUPvieSch1-b7Ny/pub?output=csv';
const NAV_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRu2J4BrxvuOqtk0hs0H5RyLEy8xan-RW0ic_6lXQiWn-KZJDkEBAh-pO71AovTKPUPvieSch1-b7Ny/pub?gid=263826725&single=true&output=csv';

let navRows = []; 

// ---------------------------------------------------------
// 1. ROBUST CSV PARSER (Handles Newlines in Text)
// ---------------------------------------------------------
// ---------------------------------------------------------
// 1. ROBUST CSV PARSER (Handles Newlines & Spaces)
// ---------------------------------------------------------
function parseCSV(csvText) {
    const rawLines = csvText.split(/\r?\n/);
    const mergedRows = [];
    let currentBuffer = '';
    let insideQuotes = false;

    // A. Stitch multi-line cells back together
    rawLines.forEach(line => {
        const quoteCount = (line.match(/"/g) || []).length;
        if (!insideQuotes) {
            if (quoteCount % 2 === 0) {
                mergedRows.push(line);
            } else {
                currentBuffer = line;
                insideQuotes = true;
            }
        } else {
            currentBuffer += "\n" + line; // Restore the newline
            if (quoteCount % 2 !== 0) {
                mergedRows.push(currentBuffer);
                insideQuotes = false;
            }
        }
    });

    if (mergedRows.length < 2) return [];

    // B. Get Headers (Clean)
    const headers = mergedRows[0].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g).map(h => 
        h.replace(/^"|"$/g, "").trim().toLowerCase()
    );

    // C. Map Rows
    return mergedRows.slice(1).filter(r => r.trim() !== "").map(row => {
        // This regex respects spaces inside sentences
        const values = row.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
        const rowData = {};
        
        headers.forEach((header, index) => {
            let val = values[index] || "";
            // Clean up CSV quotes but keep content structure
            val = val.replace(/^"|"$/g, "").replace(/""/g, '"').trim();
            rowData[header] = val;
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

    navRows.forEach(item => {
        // Skip empty rows
        if (!item.name) return;

        const li = document.createElement('li');
        li.className = 'nav-item';
        li.innerHTML = `${item.name} <span class="circle">○</span>`;

        li.addEventListener('click', () => {
            // Visual Update
            document.querySelectorAll('.nav-item').forEach(el => {
                el.classList.remove('active');
                el.querySelector('.circle').textContent = '○';
            });
            li.classList.add('active');
            li.querySelector('.circle').textContent = '●';

            // LOGIC: Check the "type" column from your sheet
            const type = (item.type || '').toLowerCase();

            if (type === 'database') {
                // 1. DATABASE: Hide Overlay
                overlay.classList.remove('active');
                window.location.hash = ''; // Clear hash for home
                
            } else if (type === 'toggle' || type === 'text') {
                // 2. TOGGLE/TEXT: Show Overlay
                overlayContent.textContent = item.text;
                overlay.classList.add('active');
                document.getElementById('overlay-curtain').scrollTop = 0; // Reset scroll
                if(item.url) window.location.hash = item.url;

            } else {
                // 3. OTHERS (e.g. "filter", "sort")
                // Do nothing for now, or add filter logic here later
                console.log("Clicked a filter or unknown type:", type);
            }
        });

        navList.appendChild(li);

        // Auto-select Home on Load
        if ((item.type || '').toLowerCase() === 'database') {
            li.classList.add('active');
            li.querySelector('.circle').textContent = '●';
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
    try {
        const response = await fetch(SHEET_URL);
        const csvData = await response.text();
        const products = parseCSV(csvData);

        const visualGrid = document.getElementById('visual-grid');
        const infoGrid = document.getElementById('info-grid'); 
        const vTemplate = document.getElementById('visual-template');
        const iTemplate = document.getElementById('info-template');

        // --- IMAGE COLUMN FINDER (The Fix) ---
        // We look for ANY header that looks like an image column
        const headers = Object.keys(products[0] || {});
        const imgKey = headers.find(h => h.includes('img') || h.includes('image') || h.includes('pic'));
        
        console.log("Detected Image Header:", imgKey); // Check console if images still fail

        let totalImages = 0;
        let imagesLoaded = 0;
        
        const checkProgress = () => {
            imagesLoaded++;
            if (imagesLoaded >= totalImages) {
                const loader = document.getElementById('loading-screen');
                if (loader) {
                    loader.classList.add('loader-hidden');
                    setTimeout(() => { loader.style.display = 'none'; }, 800);
                }
            }
        };

        // Pass 1: Count
        products.forEach(p => { if (p[imgKey]) totalImages++; });
        if (totalImages === 0) document.getElementById('loading-screen').style.display = 'none';

        // Pass 2: Build
        products.forEach((piece) => {
            const p = {
                id:    piece['id'],
                name:  piece['name'],
                type:  piece['type'],
                style: piece['style'],
                color: piece['color'],
                size:  piece['size'],
                price: piece['price'],
                img:   getDirectImgLink(piece[imgKey]) // Use the detected key
            };

            if (!p.id) return;

            // Visual
            const vClone = vTemplate.content.cloneNode(true);
            vClone.querySelector('.piece-id').textContent = `${p.id}.`;
            const imgEl = vClone.querySelector('.piece-img');
            
            if (p.img) {
                imgEl.src = p.img;
                imgEl.alt = p.name;
                imgEl.onload = checkProgress;
                imgEl.onerror = checkProgress;
            } else {
                imgEl.remove();
            }
            visualGrid.appendChild(vClone);

            // Info
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

            const btn = iClone.querySelector('.add-btn');
            btn.setAttribute('data-item-id', p.id);
            btn.setAttribute('data-item-name', p.name);
            btn.setAttribute('data-item-price', p.price ? p.price.replace(/[^0-9.]/g, '') : '0');
            btn.setAttribute('data-item-url', window.location.href.split('#')[0]);
            btn.setAttribute('data-item-image', p.img);

            infoGrid.appendChild(iClone);
        });

    } catch (err) {
        console.error("Database connection failed", err);
    }
}

initSite();