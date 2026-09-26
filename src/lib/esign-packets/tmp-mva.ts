// ============================================================================
// TMP MVA retainer packets for DocuSeal: contract + HIPAA/HITECH as one PDF per
// agreement (TX, FL, and the AL/GA contract for every other state).
//
// Built from TMP's own contracts, untouched. Field areas were placed and checked
// against rendered previews (claude/ClaimReach-TMP-MVA-DocuSeal-Fieldmap.md).
// Client fills name, today's date and signature. Intake (second signer, via the
// API) adds DOB and SSN. Nobody at Innovative signs or dates the firm's lines.
//
// The PDFs sit in /public under an unguessable folder only so DocuSeal can fetch
// them once when an admin runs the setup. They are blank firm forms, no client data.
// ============================================================================

export const TMP_MVA_ROLES = ["Client", "Intake"] as const;

export interface PacketField { name: string; type: string; role: string; readonly?: boolean; required?: boolean; preferences?: Record<string, unknown>; areas: { page: number; x: number; y: number; w: number; h: number }[] }
export interface Packet { name: string; external_id: string; path: string; fields: PacketField[] }

export const TMP_MVA_PACKETS: Record<"TX" | "FL" | "OTHER", Packet> = {
  "TX": {
    "name": "TMP MVA Retainer + HIPAA/HITECH - Texas",
    "external_id": "tmp-mva-tx",
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
        "name": "Signing Date",
        "type": "date",
        "role": "Client",
        "readonly": true,
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom",
          "format": "MM/DD/YYYY"
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
        "required": true,
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
      }
    ]
  },
  "OTHER": {
    "name": "TMP MVA Retainer + HIPAA/HITECH - All other states (AL/GA form)",
    "external_id": "tmp-mva-alga",
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
        "name": "Signing Date",
        "type": "date",
        "role": "Client",
        "readonly": true,
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom",
          "format": "MM/DD/YYYY"
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
        "required": true,
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
      }
    ]
  },
  "FL": {
    "name": "TMP MVA Retainer + HIPAA/HITECH - Florida",
    "external_id": "tmp-mva-fl",
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
        "name": "Signing Date",
        "type": "date",
        "role": "Client",
        "readonly": true,
        "required": true,
        "preferences": {
          "font_size": 10,
          "font": "Helvetica",
          "valign": "bottom",
          "format": "MM/DD/YYYY"
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
        "required": true,
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
      }
    ]
  }
};
