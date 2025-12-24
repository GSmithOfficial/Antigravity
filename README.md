# KetchDraw

A free, open-source ChemDraw alternative built with Ketcher and RDKit.js. Draw molecular structures and see calculated properties in real-time.

## Features

- **Ketcher Molecule Editor**: Full-featured 2D molecular structure editor from EPAM
- **Live Property Calculations**: Properties update instantly as you draw using RDKit.js
- **Structure Preview**: RDKit renders SVG previews of each molecule in the properties panel
- **Multiple Molecule Support**: Draw multiple disconnected fragments to see properties for each
- **Drug-likeness Highlighting**: Properties violating Lipinski's rules are highlighted in yellow/red
- **Collapsible Panel**: Maximize drawing space by collapsing the properties panel
- **Copy SMILES**: One-click copy of SMILES strings

## Calculated Properties

| Property | Description |
|----------|-------------|
| MW | Molecular Weight |
| cLogP | Calculated LogP (Crippen method) |
| TPSA | Topological Polar Surface Area |
| HBA | Hydrogen Bond Acceptors |
| HBD | Hydrogen Bond Donors |
| Fsp3 | Fraction of sp3 carbons |
| RotB | Rotatable Bonds |
| HAC | Heavy Atom Count |
| Hetero | Heteroatom Count |
| ArRings | Aromatic Ring Count |
| Stereo | Defined Stereocenters |
| Unspec | Unspecified Stereocenters |

## Usage

### GitHub Pages

1. Enable GitHub Pages in your repository settings
2. Set source to main branch
3. Access at `https://[username].github.io/Ketchdraw`

### Local Development

Serve via a local HTTP server (required for iframe to work):

```bash
# Python 3
python -m http.server 8000

# Node.js
npx serve
```

Then visit `http://localhost:8000`

## Drawing Tips

- Click and drag to draw bonds
- Use the element toolbar to change atom types
- Use templates for common ring structures
- Draw disconnected fragments for multiple molecules
- Use the eraser tool or select and delete to remove atoms/bonds

## Drug-Likeness Rules (Lipinski's Rule of Five)

Properties are color-coded based on oral bioavailability guidelines:
- **Green**: Within guidelines
- **Yellow**: Approaching limits
- **Red**: Exceeds limits

| Property | Warning | Alert |
|----------|---------|-------|
| MW | >450 | >500 |
| cLogP | >4 | >5 |
| TPSA | >120 | >140 |
| HBA | >8 | >10 |
| HBD | >4 | >5 |
| RotB | >7 | >10 |

## Technology Stack

- [Ketcher](https://github.com/epam/ketcher) - Molecular structure editor by EPAM
- [RDKit.js](https://github.com/rdkit/rdkit-js) - Cheminformatics toolkit for JavaScript

## License

MIT License - free to use and modify.

## Acknowledgments

- EPAM for the excellent Ketcher editor
- RDKit community for the JavaScript/WebAssembly port
