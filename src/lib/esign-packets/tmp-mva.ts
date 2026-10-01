// ============================================================================
// TMP MVA retainer packets for DocuSeal: contract + HIPAA/HITECH as one PDF per
// agreement (TX, FL, and the AL/GA contract for every other state).
//
// Built from TMP's own contracts, untouched. Field areas were placed and checked
// against rendered previews (claude/ClaimReach-TMP-MVA-DocuSeal-Fieldmap.md).
// Client fills name, today's date and signature; the call fills the injured
// person ("injuries suffered by") and the date of the wreck ("on/around") on
// page 1. Intake (second signer, via the API) adds DOB, SSN and the date under
// the firm's signature. v3 names: a send finds an older template by name and
// makes the new one on its own (templateFor in src/lib/mva-call/esign.ts).
//
// The PDFs sit in /public under an unguessable folder only so DocuSeal can fetch
// them once when an admin runs the setup. They are blank firm forms, no client data.
// ============================================================================

export const TMP_MVA_ROLES = ["Client", "Intake"] as const;

export interface PacketField { name: string; type: string; role: string; readonly?: boolean; required?: boolean; preferences?: Record<string, unknown>; areas: { page: number; x: number; y: number; w: number; h: number }[] }
export interface Packet { name: string; external_id: string; path: string; fields: PacketField[] }

// Nevada (Brett, Sep 28): TMP's two Nevada contracts — tiered fees (the
// DEFAULT for a Nevada wreck) and non-tiered (sends only with a typed
// approval reason, recorded on the file; the route enforces it). Each is the
// contract Brett supplied, untouched, plus the same HIPAA/HITECH pages every
// other agreement carries: pages 5-7 are byte-identical to the AL/GA form's
// pages 4-6, so those field areas are copied with the page number shifted.
// Contract-page coordinates were measured from the PDFs (pdftotext -bbox).
// Note: Brett's Nevada contracts came WITHOUT TMP's countersignature printed
// on the firm line (the AL/GA form has it embedded); the line stays blank
// exactly as supplied.
function nvPacket(opts: {
  name: string; external_id: string; path: string;
  sig: { page: number; y: number }; date: { page: number; y: number };
}): Packet {
  const text = (name: string, areas: PacketField["areas"], role = "Client", ro = true): PacketField => ({
    name, type: "text", role, ...(ro ? { readonly: true } : {}), required: name !== "Patient SSN",
    preferences: { font_size: 10, font: "Helvetica", valign: "bottom" }, areas,
  });
  return {
    name: opts.name, external_id: opts.external_id, path: opts.path,
    fields: [
      text("Client Name", [
        { page: 1, x: 0.41945, y: 0.25, w: 0.48, h: 0.01515 },
        { page: 5, x: 0.06209, y: 0.92929, w: 0.40523, h: 0.01515 },
        { page: 7, x: 0.53268, y: 0.3851, w: 0.34641, h: 0.01515 },
      ]),
      text("Injured Party Name", [
        { page: 1, x: 0.08987, y: 0.36526, w: 0.25358, h: 0.01515 },
        { page: 5, x: 0.51797, y: 0.24874, w: 0.36601, h: 0.01515 },
        { page: 6, x: 0.42157, y: 0.24369, w: 0.26797, h: 0.01515 },
      ]),
      text("Accident Date", [
        { page: 1, x: 0.43317, y: 0.36526, w: 0.18007, h: 0.01515 },
      ]),
      text("Signing Date", [
        { page: opts.date.page, x: 0.12745, y: opts.date.y, w: 0.24837, h: 0.01515 },
        { page: 5, x: 0.5719, y: 0.89773, w: 0.24837, h: 0.01515 },
        { page: 6, x: 0.1781, y: 0.09343, w: 0.20425, h: 0.01515 },
      ]),
      {
        name: "Client Signature", type: "signature", role: "Client", required: true,
        areas: [
          { page: opts.sig.page, x: 0.08252, y: opts.sig.y, w: 0.28758, h: 0.03535 },
          { page: 5, x: 0.08497, y: 0.88005, w: 0.38235, h: 0.0303 },
          { page: 7, x: 0.53268, y: 0.32323, w: 0.34641, h: 0.02273 },
        ],
      },
      text("Patient DOB", [
        { page: 5, x: 0.55229, y: 0.31439, w: 0.3317, h: 0.01515 },
        { page: 6, x: 0.41013, y: 0.26263, w: 0.27778, h: 0.01515 },
      ], "Intake", false),
      text("Patient SSN", [
        { page: 5, x: 0.49837, y: 0.33586, w: 0.38562, h: 0.01515 },
        { page: 6, x: 0.5049, y: 0.29924, w: 0.18627, h: 0.01515 },
      ], "Intake", false),
      text("Firm Date", [
        { page: opts.date.page, x: 0.54085, y: opts.date.y, w: 0.22, h: 0.01515 },
      ], "Intake", false),
    ],
  };
}

export const TMP_MVA_PACKETS: Record<"TX" | "FL" | "OTHER" | "NV" | "NV_FLAT", Packet> = {
  "NV": nvPacket({
    name: "TMP MVA Retainer + HIPAA/HITECH - Nevada Tiered v2",
    external_id: "tmp-mva-nv-v2",
    path: "/esign-src/19ca4877a978c8c85317f5f9/tmp-mva-nv.pdf",
    sig: { page: 4, y: 0.0895 }, date: { page: 4, y: 0.16066 },
  }),
  "NV_FLAT": nvPacket({
    name: "TMP MVA Retainer + HIPAA/HITECH - Nevada Non-Tiered v2",
    external_id: "tmp-mva-nv-flat-v2",
    path: "/esign-src/19ca4877a978c8c85317f5f9/tmp-mva-nv-flat.pdf",
    // The non-tiered contract's signature block breaks across the page: the
    // signature lines sit at the bottom of page 3, the two Date lines at the
    // top of page 4 — the fields follow the document as supplied.
    sig: { page: 3, y: 0.82103 }, date: { page: 4, y: 0.09274 },
  }),
  "TX": {
    "name": "TMP MVA Retainer + HIPAA/HITECH - Texas v4",
    "external_id": "tmp-mva-tx-v4",
    "path": "/esign-src/19ca4877a978c8c85317f5f9/tmp-mva-tx.pdf",
    "fields": [
      {
        "name": "Client Name",
        "type": "text",
        "role": "Client",
        "readonly": true,
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 1,
            "x": 0.36111,
            "y": 0.25,
            "w": 0.45752,
            "h": 0.01515
          },
          {
            "page": 4,
            "x": 0.06209,
            "y": 0.92929,
            "w": 0.40523,
            "h": 0.01515
          },
          {
            "page": 6,
            "x": 0.53268,
            "y": 0.3851,
            "w": 0.34641,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Injured Party Name",
        "type": "text",
        "role": "Client",
        "readonly": true,
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 1,
            "x": 0.3567,
            "y": 0.3515,
            "w": 0.2314,
            "h": 0.01515
          },
          {
            "page": 4,
            "x": 0.51797,
            "y": 0.24874,
            "w": 0.36601,
            "h": 0.01515
          },
          {
            "page": 5,
            "x": 0.42157,
            "y": 0.24369,
            "w": 0.26797,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Accident Date",
        "type": "text",
        "role": "Client",
        "readonly": true,
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 1,
            "x": 0.677,
            "y": 0.3515,
            "w": 0.156,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Signing Date",
        "type": "text",
        "role": "Client",
        "readonly": true,
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 3,
            "x": 0.12582,
            "y": 0.63889,
            "w": 0.24837,
            "h": 0.01515
          },
          {
            "page": 4,
            "x": 0.5719,
            "y": 0.89773,
            "w": 0.24837,
            "h": 0.01515
          },
          {
            "page": 5,
            "x": 0.1781,
            "y": 0.09343,
            "w": 0.20425,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Client Signature",
        "type": "signature",
        "role": "Client",
        "required": true,
        "areas": [
          {
            "page": 3,
            "x": 0.08497,
            "y": 0.56755,
            "w": 0.28758,
            "h": 0.03535
          },
          {
            "page": 4,
            "x": 0.08497,
            "y": 0.88005,
            "w": 0.38235,
            "h": 0.0303
          },
          {
            "page": 6,
            "x": 0.53268,
            "y": 0.32323,
            "w": 0.34641,
            "h": 0.02273
          }
        ]
      },
      {
        "name": "Patient DOB",
        "type": "text",
        "role": "Intake",
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 4,
            "x": 0.55229,
            "y": 0.31439,
            "w": 0.3317,
            "h": 0.01515
          },
          {
            "page": 5,
            "x": 0.41013,
            "y": 0.26263,
            "w": 0.27778,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Patient SSN",
        "type": "text",
        "role": "Intake",
        "required": false,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 4,
            "x": 0.49837,
            "y": 0.33586,
            "w": 0.38562,
            "h": 0.01515
          },
          {
            "page": 5,
            "x": 0.5049,
            "y": 0.29924,
            "w": 0.18627,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Firm Date",
        "type": "text",
        "role": "Intake",
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 3,
            "x": 0.5415,
            "y": 0.63889,
            "w": 0.24387,
            "h": 0.01515
          }
        ]
      }
    ]
  },
  "OTHER": {
    "name": "TMP MVA Retainer + HIPAA/HITECH - All other states (AL/GA form) v4",
    "external_id": "tmp-mva-alga-v4",
    "path": "/esign-src/19ca4877a978c8c85317f5f9/tmp-mva-other.pdf",
    "fields": [
      {
        "name": "Client Name",
        "type": "text",
        "role": "Client",
        "readonly": true,
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 1,
            "x": 0.36111,
            "y": 0.25,
            "w": 0.45752,
            "h": 0.01515
          },
          {
            "page": 4,
            "x": 0.06209,
            "y": 0.92929,
            "w": 0.40523,
            "h": 0.01515
          },
          {
            "page": 6,
            "x": 0.53268,
            "y": 0.3851,
            "w": 0.34641,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Injured Party Name",
        "type": "text",
        "role": "Client",
        "readonly": true,
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 1,
            "x": 0.3641,
            "y": 0.3515,
            "w": 0.2314,
            "h": 0.01515
          },
          {
            "page": 4,
            "x": 0.51797,
            "y": 0.24874,
            "w": 0.36601,
            "h": 0.01515
          },
          {
            "page": 5,
            "x": 0.42157,
            "y": 0.24369,
            "w": 0.26797,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Accident Date",
        "type": "text",
        "role": "Client",
        "readonly": true,
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 1,
            "x": 0.6845,
            "y": 0.3515,
            "w": 0.156,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Signing Date",
        "type": "text",
        "role": "Client",
        "readonly": true,
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 3,
            "x": 0.12582,
            "y": 0.65593,
            "w": 0.24837,
            "h": 0.01515
          },
          {
            "page": 4,
            "x": 0.5719,
            "y": 0.89773,
            "w": 0.24837,
            "h": 0.01515
          },
          {
            "page": 5,
            "x": 0.1781,
            "y": 0.09343,
            "w": 0.20425,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Client Signature",
        "type": "signature",
        "role": "Client",
        "required": true,
        "areas": [
          {
            "page": 3,
            "x": 0.08497,
            "y": 0.5846,
            "w": 0.28758,
            "h": 0.03535
          },
          {
            "page": 4,
            "x": 0.08497,
            "y": 0.88005,
            "w": 0.38235,
            "h": 0.0303
          },
          {
            "page": 6,
            "x": 0.53268,
            "y": 0.32323,
            "w": 0.34641,
            "h": 0.02273
          }
        ]
      },
      {
        "name": "Patient DOB",
        "type": "text",
        "role": "Intake",
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 4,
            "x": 0.55229,
            "y": 0.31439,
            "w": 0.3317,
            "h": 0.01515
          },
          {
            "page": 5,
            "x": 0.41013,
            "y": 0.26263,
            "w": 0.27778,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Patient SSN",
        "type": "text",
        "role": "Intake",
        "required": false,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 4,
            "x": 0.49837,
            "y": 0.33586,
            "w": 0.38562,
            "h": 0.01515
          },
          {
            "page": 5,
            "x": 0.5049,
            "y": 0.29924,
            "w": 0.18627,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Firm Date",
        "type": "text",
        "role": "Intake",
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 3,
            "x": 0.5415,
            "y": 0.65593,
            "w": 0.24387,
            "h": 0.01515
          }
        ]
      }
    ]
  },
  "FL": {
    "name": "TMP MVA Retainer + HIPAA/HITECH - Florida v4",
    "external_id": "tmp-mva-fl-v4",
    "path": "/esign-src/19ca4877a978c8c85317f5f9/tmp-mva-fl.pdf",
    "fields": [
      {
        "name": "Client Name",
        "type": "text",
        "role": "Client",
        "readonly": true,
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 1,
            "x": 0.43627,
            "y": 0.23106,
            "w": 0.44608,
            "h": 0.01515
          },
          {
            "page": 4,
            "x": 0.06209,
            "y": 0.92929,
            "w": 0.40523,
            "h": 0.01515
          },
          {
            "page": 6,
            "x": 0.53268,
            "y": 0.3851,
            "w": 0.34641,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Injured Party Name",
        "type": "text",
        "role": "Client",
        "readonly": true,
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 1,
            "x": 0.5498,
            "y": 0.3311,
            "w": 0.2345,
            "h": 0.01515
          },
          {
            "page": 4,
            "x": 0.51797,
            "y": 0.24874,
            "w": 0.36601,
            "h": 0.01515
          },
          {
            "page": 5,
            "x": 0.42157,
            "y": 0.24369,
            "w": 0.26797,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Accident Date",
        "type": "text",
        "role": "Client",
        "readonly": true,
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 1,
            "x": 0.1262,
            "y": 0.3481,
            "w": 0.172,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Signing Date",
        "type": "text",
        "role": "Client",
        "readonly": true,
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 3,
            "x": 0.57516,
            "y": 0.78283,
            "w": 0.2451,
            "h": 0.01515
          },
          {
            "page": 4,
            "x": 0.5719,
            "y": 0.89773,
            "w": 0.24837,
            "h": 0.01515
          },
          {
            "page": 5,
            "x": 0.1781,
            "y": 0.09343,
            "w": 0.20425,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Client Signature",
        "type": "signature",
        "role": "Client",
        "required": true,
        "areas": [
          {
            "page": 3,
            "x": 0.11928,
            "y": 0.76199,
            "w": 0.23203,
            "h": 0.03535
          },
          {
            "page": 4,
            "x": 0.08497,
            "y": 0.88005,
            "w": 0.38235,
            "h": 0.0303
          },
          {
            "page": 6,
            "x": 0.53268,
            "y": 0.32323,
            "w": 0.34641,
            "h": 0.02273
          }
        ]
      },
      {
        "name": "Patient DOB",
        "type": "text",
        "role": "Intake",
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 4,
            "x": 0.55229,
            "y": 0.31439,
            "w": 0.3317,
            "h": 0.01515
          },
          {
            "page": 5,
            "x": 0.41013,
            "y": 0.26263,
            "w": 0.27778,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Patient SSN",
        "type": "text",
        "role": "Intake",
        "required": false,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 4,
            "x": 0.49837,
            "y": 0.33586,
            "w": 0.38562,
            "h": 0.01515
          },
          {
            "page": 5,
            "x": 0.5049,
            "y": 0.29924,
            "w": 0.18627,
            "h": 0.01515
          }
        ]
      },
      {
        "name": "Firm Date",
        "type": "text",
        "role": "Intake",
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom"
        },
        "areas": [
          {
            "page": 3,
            "x": 0.57516,
            "y": 0.86815,
            "w": 0.24837,
            "h": 0.01515
          }
        ]
      }
    ]
  }
};
