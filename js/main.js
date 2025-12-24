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

    } catch (e) {
        console.error("Error in updateProperties", e);
    }
}

function calculateForFragment(smiles, index) {
    let mol = null;
    try {
        mol = rdkit.get_mol(smiles);
        if (!mol) return `<div class="molecule-card"><div class="molecule-title">Molecule ${index}</div><div style="color:red">Invalid Structure</div></div>`;

        // Calculate properties
        let descriptors = {};
        try {
            const descStr = mol.get_descriptors();
            descriptors = JSON.parse(descStr);
        } catch (e) {
            // console.warn("get_descriptors failed", e);
        }

        const safeGet = (key, fnName) => {
            if (descriptors[key] !== undefined) return descriptors[key];
            if (mol[fnName]) return mol[fnName]();
            return "N/A";
        };

        const properties = {
            "MW": safeGet('exactmw', 'get_molecular_weight'),
            "ClogP": safeGet('lipinski_h_donors', 'get_logp') === "N/A" ? safeGet('clogp', 'get_logp') : safeGet('clogp', 'get_logp'),
            "TPSA": safeGet('tpsa', 'get_tpsa'),
            "HBA": safeGet('lipinski_h_acceptors', 'get_hba'),
            "HBD": safeGet('lipinski_h_donors', 'get_hbd'),
            "Fsp3": safeGet('fraction_csp3', 'get_fraction_csp3'),
            "Rotatable Bonds": safeGet('num_rotatable_bonds', 'get_num_rotatable_bonds'),
            "HAC": safeGet('heavy_atom_count', 'get_num_heavy_atoms'),
            "Hetero Atoms": safeGet('num_heteroatoms', 'get_num_heteroatoms'),
            "Ar Rings": safeGet('num_aromatic_rings', 'get_num_aromatic_rings'),
            "Stereo": "Unspecified"
        };

        // Manual fallbacks for common descriptor names
        if (properties["MW"] === "N/A" && descriptors["amw"]) properties["MW"] = descriptors["amw"];
        if (properties["ClogP"] === "N/A" && descriptors["mollogp"]) properties["ClogP"] = descriptors["mollogp"];
        if (properties["HBA"] === "N/A" && descriptors["numhacceptors"]) properties["HBA"] = descriptors["numhacceptors"];
        if (properties["HBD"] === "N/A" && descriptors["numhdonors"]) properties["HBD"] = descriptors["numhdonors"];
        if (properties["Fsp3"] === "N/A" && descriptors["fractioncsp3"]) properties["Fsp3"] = descriptors["fractioncsp3"];
        if (properties["Rotatable Bonds"] === "N/A" && descriptors["numrotatablebonds"]) properties["Rotatable Bonds"] = descriptors["numrotatablebonds"];
        if (properties["HAC"] === "N/A" && descriptors["numheavyatoms"]) properties["HAC"] = descriptors["numheavyatoms"];
        if (properties["Hetero Atoms"] === "N/A" && descriptors["numheteroatoms"]) properties["Hetero Atoms"] = descriptors["numheteroatoms"];
        if (properties["Ar Rings"] === "N/A" && descriptors["numaromaticrings"]) properties["Ar Rings"] = descriptors["numaromaticrings"];

        const format = (v) => typeof v === 'number' ? v.toFixed(2) : v;

        let tableRows = '';
        for (const [key, value] of Object.entries(properties)) {
            tableRows += `
                <tr>
                    <td class="prop-label">${key}</td>
                    <td class="prop-value">${format(value)}</td>
                </tr>
            `;
        }

        return `
            <div class="molecule-card">
                <div class="molecule-title">Molecule ${index}</div>
                <table class="prop-table">
                    ${tableRows}
                </table>
            </div>
        `;

    } catch (e) {
        console.error("Error calculating for fragment", e);
        return `<div class="molecule-card"><div class="molecule-title">Molecule ${index}</div><div style="color:red">Calculation Error</div></div>`;
    } finally {
        if (mol) mol.delete();
    }
}

