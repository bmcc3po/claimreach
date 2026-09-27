// ============================================================================
// Two-tone icons for the call views, drawn to match Brett's renderings: a
// soft filled shape with a crisp outline, so each one reads at a glance and
// looks the same on every phone and computer (emoji do not).
// ============================================================================

const fill = { fill: "currentColor", fillOpacity: 0.18 };
const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export type DuoName =
  | "incident" | "injury" | "treatment" | "insurance" | "vehicle" | "notes"
  | "calendar" | "question" | "yes" | "no" | "person" | "note" | "help" | "pin" | "shield" | "clock" | "phone";

export default function DuoIcon({ name, size = 20 }: { name: DuoName | string; size?: number }) {
  const svg = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true as const };
  switch (name) {
    case "incident":
    case "pin":
      return (<svg {...svg}>
        <path {...fill} d="M12 21.2s-6.6-5.7-6.6-11A6.6 6.6 0 0 1 18.6 10.2c0 5.3-6.6 11-6.6 11z" />
        <path {...line} d="M12 21.2s-6.6-5.7-6.6-11A6.6 6.6 0 0 1 18.6 10.2c0 5.3-6.6 11-6.6 11z" />
        <circle cx="12" cy="10" r="2.4" fill="currentColor" />
      </svg>);
    case "injury":
      return (<svg {...svg}>
        <path {...fill} d="M9.2 3.8h5.6v5.4h5.4v5.6h-5.4v5.4H9.2v-5.4H3.8V9.2h5.4z" />
        <path {...line} d="M9.2 3.8h5.6v5.4h5.4v5.6h-5.4v5.4H9.2v-5.4H3.8V9.2h5.4z" />
      </svg>);
    case "treatment":
      return (<svg {...svg}>
        <path {...fill} d="M4.5 20.5V8.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v12z" />
        <path {...line} d="M3 20.5h18M4.5 20.5V8.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v12" />
        <path {...line} d="M12 9.5v5M9.5 12h5" />
        <path {...line} d="M10.3 20.5v-3h3.4v3" />
        <path {...line} d="M9 6.5V4.5h6v2" />
      </svg>);
    case "insurance":
    case "shield":
      return (<svg {...svg}>
        <path {...fill} d="M12 3.2l7 2.8v5.3c0 4.9-3.2 8.4-7 9.9-3.8-1.5-7-5-7-9.9V6z" />
        <path {...line} d="M12 3.2l7 2.8v5.3c0 4.9-3.2 8.4-7 9.9-3.8-1.5-7-5-7-9.9V6z" />
        <path {...line} d="M9 12.2l2.1 2.1 3.9-4.2" />
      </svg>);
    case "vehicle":
      return (<svg {...svg}>
        <path {...fill} d="M4 16.5v-4.2l1.9-4.8A2 2 0 0 1 7.8 6.2h8.4a2 2 0 0 1 1.9 1.3l1.9 4.8v4.2z" />
        <path {...line} d="M4 16.5v-4.2l1.9-4.8A2 2 0 0 1 7.8 6.2h8.4a2 2 0 0 1 1.9 1.3l1.9 4.8v4.2zM4 12.3h16" />
        <circle cx="7.6" cy="17.3" r="1.9" fill="currentColor" />
        <circle cx="16.4" cy="17.3" r="1.9" fill="currentColor" />
      </svg>);
    case "notes":
    case "note":
      return (<svg {...svg}>
        <path {...fill} d="M6.5 3.5h8l4 4v12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z" />
        <path {...line} d="M6.5 3.5h8l4 4v12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM14.5 3.5v4h4" />
        <path {...line} d="M8.8 12.2h6.4M8.8 15.8h4.4" />
      </svg>);
    case "calendar":
      return (<svg {...svg}>
        <rect {...fill} x="3.8" y="5.2" width="16.4" height="15.3" rx="3" />
        <rect {...line} x="3.8" y="5.2" width="16.4" height="15.3" rx="3" />
        <path {...line} d="M3.8 9.8h16.4M8.2 3.5v3.4M15.8 3.5v3.4" />
        <circle cx="8.6" cy="13.8" r="1.05" fill="currentColor" />
        <circle cx="12" cy="13.8" r="1.05" fill="currentColor" />
        <circle cx="15.4" cy="13.8" r="1.05" fill="currentColor" />
        <circle cx="8.6" cy="17" r="1.05" fill="currentColor" />
      </svg>);
    case "question":
      return (<svg {...svg}>
        <circle {...fill} cx="12" cy="12" r="8.8" />
        <circle {...line} cx="12" cy="12" r="8.8" />
        <path {...line} d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6v.3" />
        <circle cx="12" cy="16.6" r="1.1" fill="currentColor" />
      </svg>);
    case "yes":
      return (<svg {...svg}>
        <circle {...fill} cx="12" cy="12" r="8.8" />
        <circle {...line} cx="12" cy="12" r="8.8" />
        <path {...line} strokeWidth={2} d="M8.2 12.3l2.6 2.6 5-5.3" />
      </svg>);
    case "no":
      return (<svg {...svg}>
        <circle {...fill} cx="12" cy="12" r="8.8" />
        <circle {...line} cx="12" cy="12" r="8.8" />
        <path {...line} strokeWidth={2} d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />
      </svg>);
    case "person":
      return (<svg {...svg}>
        <circle {...fill} cx="12" cy="8.2" r="3.7" />
        <path {...fill} d="M4.8 20c1.1-3.8 3.9-5.8 7.2-5.8s6.1 2 7.2 5.8z" />
        <circle {...line} cx="12" cy="8.2" r="3.7" />
        <path {...line} d="M4.8 20c1.1-3.8 3.9-5.8 7.2-5.8s6.1 2 7.2 5.8z" />
      </svg>);
    case "help":
      return (<svg {...svg}>
        <path {...fill} d="M20.5 11.6a8.2 8.2 0 0 1-11.9 7.3L3.6 20.2l1.2-4.6a8.2 8.2 0 1 1 15.7-4z" />
        <path {...line} d="M20.5 11.6a8.2 8.2 0 0 1-11.9 7.3L3.6 20.2l1.2-4.6a8.2 8.2 0 1 1 15.7-4z" />
      </svg>);
    case "clock":
      return (<svg {...svg}>
        <circle {...fill} cx="12" cy="12" r="8.8" />
        <circle {...line} cx="12" cy="12" r="8.8" />
        <path {...line} d="M12 7.5V12l3 2" />
      </svg>);
    case "phone":
      return (<svg {...svg}>
        <path {...fill} d="M6.6 3.8h2.6l1.4 4-1.9 1.3a11 11 0 0 0 5.2 5.2l1.3-1.9 4 1.4v2.6a2 2 0 0 1-2.2 2A15.7 15.7 0 0 1 4.6 6a2 2 0 0 1 2-2.2z" />
        <path {...line} d="M6.6 3.8h2.6l1.4 4-1.9 1.3a11 11 0 0 0 5.2 5.2l1.3-1.9 4 1.4v2.6a2 2 0 0 1-2.2 2A15.7 15.7 0 0 1 4.6 6a2 2 0 0 1 2-2.2z" />
      </svg>);
    default:
      return null;
  }
}
