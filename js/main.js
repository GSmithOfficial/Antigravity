// Initialize RDKit and Ketcher connection
let rdkit = null;
const propertiesPanel = document.getElementById('properties-content');
const loadingStatus = document.getElementById('loading-status');
let ketcherReady = false;

// Initialize RDKit
window.initRDKitModule()
    .then((instance) => {
        rdkit = instance;
        console.log("RDKit initialized v" + rdkit.version());
        // Show something while waiting for Ketcher
        loadingStatus.innerText = "RDKit Ready. Waiting for Ketcher...";
        loadingStatus.style.display = 'block';
    })
    .catch((err) => {
        console.error("Failed to init RDKit", err);
        showError("Error loading RDKit. Please check console.");
    });

// Listen for messages from Ketcher iframe (via bridge)
window.addEventListener('message', (event) => {
    // Note: Secure origin check should be here in production, but we allow * for local file usage context
    const data = event.data;

    if (data.type === 'KETCHER_READY') {
        console.log("Ketcher Bridge Connected!");
        ketcherReady = true;
        loadingStatus.style.display = 'none';
        // Request initial struct
        requestStruct();
    }

    if (data.type === 'KETCHER_STRUCT') {
        if (!rdkit) return; // Wait for RDKit
        updatePropertiesFromSmiles(data.smiles);
    }
});

function requestStruct() {
    const iframe = document.getElementById('ketcher-frame');
    if (iframe) {
        // Send message to iframe to trigger a sendStruct
        iframe.contentWindow.postMessage({ type: 'GET_SMILES' }, '*');
    }
}

function showError(msg) {
    loadingStatus.innerHTML = `<strong>Error:</strong> ${msg}`;
    loadingStatus.style.display = 'block';
    loadingStatus.style.background = '#f8d7da';
    loadingStatus.style.color = '#721c24';
}

// Fallback: If we don't get a ready message soon, warn user about server
setTimeout(() => {
    if (!ketcherReady) {
        showError(`
            Could not connect to Ketcher. <br/><br/>
            <strong>Are you running this from a file:// URL?</strong><br/>
            For security reasons, this app requires a local web server to function correctly.<br/>
            Please use VSCode "Live Server" or run <code>python -m http.server</code> in the project folder.
        `);
    }
}, 5000);


function updatePropertiesFromSmiles(smiles) {
    if (!smiles) {
        propertiesPanel.innerHTML = '<p class="hint">Draw a molecule to see properties.</p>';
        return;
    }

    try {
        const fragments = smiles.split('.').filter(s => s.trim().length > 0);

        if (fragments.length === 0) {
            propertiesPanel.innerHTML = '<p class="hint">Draw a molecule to see properties.</p>';
            return;
        }

        let htmlInfo = '';

        fragments.forEach((fragSmiles, index) => {
            htmlInfo += calculateForFragment(fragSmiles, index + 1);
        });

        propertiesPanel.innerHTML = htmlInfo;

        // Add event listeners for copy buttons after rendering
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.onclick = () => {
                const smiles = btn.getAttribute('data-smiles');
                navigator.clipboard.writeText(smiles);
                // Simple visual feedback
                const oldIcon = btn.innerHTML;
                btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
                setTimeout(() => btn.innerHTML = oldIcon, 1000);
            };
        });

    } catch (e) {
        console.error("Error in updateProperties", e);
    }
}

function calculateForFragment(smiles, index) {
    let mol = null;
    try {
        mol = rdkit.get_mol(smiles);
        if (!mol) return `<div class="molecule-card"><div class="molecule-header"><div class="molecule-title">Mol ${index}</div></div><div style="padding:20px; color:#e63946">Invalid Structure</div></div>`;

        // Generate SVG
        let svg = "";
        try {
            // Standard RDKit minimal JS SVG generation
            svg = mol.get_svg();
        } catch (e) {
            console.error("SVG generation failed", e);
            svg = "SVG Error";
        }

        // Calculate properties
        let descriptors = {};
        try {
            const descStr = mol.get_descriptors();
            descriptors = JSON.parse(descStr);
        } catch (e) { }

        const safeGet = (key, fnName) => {
            if (descriptors[key] !== undefined) return descriptors[key];
            if (mol[fnName]) return mol[fnName]();
            return "N/A";
        };

        const propertyList = [
            { label: "MW", value: safeGet('exactmw', 'get_molecular_weight') },
            { label: "CLOGP", value: safeGet('lipinski_h_donors', 'get_logp') === "N/A" ? safeGet('clogp', 'get_logp') : safeGet('clogp', 'get_logp') },
            { label: "TPSA", value: safeGet('tpsa', 'get_tpsa') },
            { label: "HBA", value: safeGet('lipinski_h_acceptors', 'get_hba') },
            { label: "HBD", value: safeGet('lipinski_h_donors', 'get_hbd') },
            { label: "FSP3", value: safeGet('fraction_csp3', 'get_fraction_csp3') },
            { label: "ROTB", value: safeGet('num_rotatable_bonds', 'get_num_rotatable_bonds') },
            { label: "HAC", value: safeGet('heavy_atom_count', 'get_num_heavy_atoms') },
            { label: "HETERO", value: safeGet('num_heteroatoms', 'get_num_heteroatoms') },
            { label: "ARRINGS", value: safeGet('num_aromatic_rings', 'get_num_aromatic_rings') },
            { label: "STEREO", value: 0 }, // Placeholder for stereo count
            { label: "UNSPEC", value: 0 }   // Placeholder for unspecified stereo
        ];

        // Specific fallbacks for minimal build descriptor names
        propertyList.forEach(p => {
            if (p.value === "N/A") {
                const map = {
                    "MW": "amw", "CLOGP": "mollogp", "HBA": "numhacceptors", "HBD": "numhdonors",
                    "FSP3": "fractioncsp3", "ROTB": "numrotatablebonds", "HAC": "numheavyatoms",
                    "HETERO": "numheteroatoms", "ARRINGS": "numaromaticrings"
                };
                if (map[p.label] && descriptors[map[p.label]]) p.value = descriptors[map[p.label]];
            }
        });

        const format = (v) => {
            if (v === "N/A" || v === undefined) return '<span class="na">N/A</span>';
            return typeof v === 'number' ? v.toFixed(2) : v;
        };

        let gridItems = '';
        propertyList.forEach(p => {
            gridItems += `
                <div class="prop-item">
                    <span class="prop-label">${p.label}</span>
                    <span class="prop-value ${p.value === "N/A" ? 'na' : ''}">${format(p.value)}</span>
                </div>
            `;
        });

        const copyIcon = `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;

        return `
            <div class="molecule-card">
                <div class="molecule-header">
                    <div class="mol-title-group">
                        <span class="molecule-title">Mol ${index}</span>
                        <span class="molecule-smiles">${smiles}</span>
                    </div>
                    <button class="copy-btn" data-smiles="${smiles}" title="Copy SMILES">
                        ${copyIcon}
                    </button>
                </div>
                <div class="molecule-img-container">
                    ${svg}
                </div>
                <div class="prop-grid">
                    ${gridItems}
                </div>
            </div>
        `;

    } catch (e) {
        console.error("Error calculating for fragment", e);
        return `<div class="molecule-card"><div class="molecule-header"><div class="molecule-title">Mol ${index}</div></div><div style="padding:20px; color:#e63946">Calculation Error</div></div>`;
    } finally {
        if (mol) mol.delete();
    }
}

