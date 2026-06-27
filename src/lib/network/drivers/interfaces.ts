// Stub interfaces for router adapter — implementations in mikrotik-rest.ts
export interface IRouterAdapter {}
export interface RouterLogEntry {
  timestamp: string;
  severity: "info" | "warning" | "error";
  topic: string;
  message: string;
}
