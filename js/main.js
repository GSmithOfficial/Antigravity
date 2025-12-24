// Initialize RDKit and Ketcher connection
let rdkit = null;
const propertiesPanel = document.getElementById('properties-content');
const loadingStatus = document.getElementById('loading-status');
const radarContainer = document.getElementById('radar-container');
let ketcherReady = false;
let currentMolecules = []; // Store calculated data for view switching
let currentView = 'card-large'; // card-large, card-compact, radar
let radarChartInstance = null;

// View Toggles
document.getElementById('btn-card-large').onclick = () => switchView('card-large');
document.getElementById('btn-card-compact').onclick = () => switchView('card-compact');
document.getElementById('btn-radar').onclick = () => switchView('radar');

function switchView(view) {
    currentView = view;

    // Update active button state
    document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${view}`).classList.add('active');

    // Show/Hide containers
    if (view === 'radar') {
        radarContainer.style.display = 'block';
        propertiesPanel.style.display = 'none';
        renderRadar();
    } else {
        radarContainer.style.display = 'none';
        propertiesPanel.style.display = 'block';
        renderCards();
    }
}

// Initialize RDKit
window.initRDKitModule()
    .then((instance) => {
        rdkit = instance;
        console.log("RDKit initialized v" + rdkit.version());
        loadingStatus.innerText = "RDKit Ready. Waiting for Ketcher...";
        loadingStatus.style.display = 'block';
    })
    .catch((err) => {
        console.error("Failed to init RDKit", err);
        showError("Error loading RDKit. Please check console.");
    });

// Bridge Listener
window.addEventListener('message', (event) => {
    const data = event.data;
    if (data.type === 'KETCHER_READY') {
        console.log("Ketcher Bridge Connected!");
        ketcherReady = true;
        loadingStatus.style.display = 'none';
        requestStruct();
    }
    if (data.type === 'KETCHER_STRUCT') {
        if (!rdkit) return;
        processStructure(data.smiles);
    }
});

function requestStruct() {
    const iframe = document.getElementById('ketcher-frame');
    if (iframe) iframe.contentWindow.postMessage({ type: 'GET_SMILES' }, '*');
}

function showError(msg) {
    loadingStatus.innerHTML = `<strong>Error:</strong> ${msg}`;
    loadingStatus.style.display = 'block';
    loadingStatus.style.background = '#f8d7da';
    loadingStatus.style.color = '#721c24';
}

setTimeout(() => {
    if (!ketcherReady) {
        showError(`
            Could not connect to Ketcher.<br/><br/>
            <strong>Running from file://?</strong><br/>
            Please use a local web server (vscode Live Server or python -m http.server).
        `);
    }
}, 5000);

function processStructure(smiles) {
    if (!smiles) {
        currentMolecules = [];
        renderCards();
        return;
    }

    try {
        const fragments = smiles.split('.').filter(s => s.trim().length > 0);
        currentMolecules = fragments.map((frag, idx) => calculateProperties(frag, idx + 1));

        if (currentView === 'radar') {
            renderRadar();
        } else {
            renderCards();
        }

    } catch (e) {
        console.error("Error processing structure", e);
    }
}

// Core Calculation Logic
function calculateProperties(smiles, index) {
    let mol = null;
    try {
        mol = rdkit.get_mol(smiles);
        if (!mol) return { index, error: "Invalid Structure", smiles };

        // 1. Generate SVG
        let svg = mol.get_svg();

        // 2. Calculate Properties (descriptors + manual SMARTS)
        const descriptors = {};

        // Try getting JSON descriptors first
        try {
            const descJSON = mol.get_descriptors();
            if (descJSON) Object.assign(descriptors, JSON.parse(descJSON));
        } catch (e) { }

        // Helper for Smart Counts
        const countPattern = (pattern) => {
            try {
                const qmol = rdkit.get_qmol(pattern);
                const matches = mol.get_substruct_matches(qmol);
                qmol.delete();
                return JSON.parse(matches).length;
            } catch (e) { return 0; }
        };

        // Manual Calculations if missing
        // HBD: [#7,#8;!H0]
        // HBA: [#7,#8] (simplified)
        // RotBond: [!$(*#*)&!D1]-&!@[!$(*#*)&!D1]
        // ArRings: a1aaaaa1 etc, hard to do generic ring count in minimal without Descriptors.
        // If descriptors are empty, we try best effort.

        const val = (key, fallbackFn) => {
            if (descriptors[key] !== undefined) return descriptors[key];
            if (typeof fallbackFn === 'function') return fallbackFn();
            return "N/A";
        };

        const props = {
            MW: val('amw', () => val('exactmw', () => mol.get_molecular_weight ? mol.get_molecular_weight() : "N/A")),
            CLOGP: val('mollogp', () => val('clogp', null)), // No manual fallback for LogP in minimal
            TPSA: val('tpsa', () => val('TPSA', null)), // standard minimal key
            HBA: val('numhacceptors', () => countPattern('[#7,#8]')),
            HBD: val('numhdonors', () => countPattern('[#7,#8;!H0]')),
            FSP3: val('fractioncsp3', null),
            ROTB: val('numrotatablebonds', () => countPattern('[!$(*#*)&!D1]-&!@[!$(*#*)&!D1]')),
            HAC: val('heavyatomcount', () => val('numheavyatoms', () => mol.get_num_atoms ? mol.get_num_atoms() : "N/A")),
            HETERO: val('numheteroatoms', () => countPattern('[!#6;!#1]')),
            ARRINGS: val('numaromaticrings', null), // hard to count via limited SMARTS without ring info
            STEREO: "N/A",
            UNSPEC: "N/A"
        };

        // Clean N/A for graph (use 0)
        const numeric = {};
        for (let k in props) numeric[k] = (props[k] === "N/A") ? 0 : props[k];

        return {
            index,
            smiles,
            svg,
            props,
            numeric,
            error: null
        };

    } catch (e) {
        console.error(e);
        return { index, error: "Calc Error", smiles };
    } finally {
        if (mol) mol.delete();
    }
}

function renderCards() {
    if (currentMolecules.length === 0) {
        propertiesPanel.innerHTML = '<p class="hint">Draw a molecule to see properties.</p>';
        return;
    }

    // Add copy listener only once roughly, or re-add

    propertiesPanel.innerHTML = currentMolecules.map(mol => {
        if (mol.error) return `<div class="molecule-card"><div class="molecule-header"><div class="molecule-title">Mol ${mol.index}</div></div><div style="padding:20px; color:#e63946">${mol.error}</div></div>`;

        const compactClass = currentView === 'card-compact' ? 'compact' : '';
        const format = (v) => (v === "N/A") ? '<span class="na">N/A</span>' : (typeof v === 'number' ? v.toFixed(2) : v);

        const gridItems = Object.entries(mol.props).map(([k, v]) => `
            <div class="prop-item">
                <span class="prop-label">${k}</span>
                <span class="prop-value ${v === "N/A" ? 'na' : ''}">${format(v)}</span>
            </div>
        `).join('');

        const copyIcon = `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;

        return `
            <div class="molecule-card ${compactClass}">
                <div class="molecule-header">
                    <div class="mol-title-group">
                        <span class="molecule-title">Mol ${mol.index}</span>
                        <span class="molecule-smiles">${mol.smiles}</span>
                    </div>
                    <button class="copy-btn" data-smiles="${mol.smiles}" title="Copy SMILES">
                        ${copyIcon}
                    </button>
                </div>
                <div class="molecule-img-container">
                    ${mol.svg}
                </div>
                <div class="prop-grid">
                    ${gridItems}
                </div>
            </div>
        `;
    }).join('');

    // Re-attach listeners
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.onclick = () => {
            navigator.clipboard.writeText(btn.getAttribute('data-smiles'));
            // animation
            const old = btn.innerHTML;
            btn.innerHTML = '<svg viewBox="0 0 24 24" style="fill:#52b788"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
            setTimeout(() => btn.innerHTML = old, 1000);
        };
    });
}

function renderRadar() {
    if (radarChartInstance) radarChartInstance.destroy();

    const ctx = document.getElementById('radarChart');
    if (!currentMolecules.length) return;

    // Filter out error mols
    const validMols = currentMolecules.filter(m => !m.error);
    if (!validMols.length) return;

    // Select keys that make sense for Radar (normalized ish?)
    // Radar plots are bad if scales differ wildly (MW 300 vs LogP 2). 
    // Usually we plot specific descriptors. Let's just plot basic Lipinski-ish ones.
    const keys = ['CLOGP', 'TPSA', 'HBA', 'HBD', 'ROTB', 'HAC'];
    // TPSA and HAC can be large, LogP small. Chart.js radar creates one axis per radial unless configured? 
    // Actually standard radar is single scale. We might need normalized data or just raw and let user see.
    // Let's stick to raw for now as requested "delta values for each value" implies comparison.

    // Dataset colors
    const colors = [
        'rgba(255, 99, 132, 0.5)',
        'rgba(54, 162, 235, 0.5)',
        'rgba(255, 206, 86, 0.5)',
        'rgba(75, 192, 192, 0.5)',
        'rgba(153, 102, 255, 0.5)'
    ];

    const datasets = validMols.map((m, i) => ({
        label: `Mol ${m.index}`,
        data: keys.map(k => m.numeric[k]),
        backgroundColor: colors[i % colors.length],
        borderColor: colors[i % colors.length].replace('0.5', '1'),
        borderWidth: 1
    }));

    radarChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: keys,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#e0e1dd' }
                }
            }
        }
    });
}
