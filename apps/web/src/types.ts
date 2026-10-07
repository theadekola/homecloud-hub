export type Status = 'healthy' | 'warning' | 'critical' | 'online' | 'offline' | 'running' | 'stopped' | 'success' | 'failed' | 'active' | 'paused' | 'disabled';

export interface DashboardData {
  stats: Record<string, number | string>;
  metrics: { time: string; cpu: number; memory: number; network: number; storage: number }[];
  alerts: Alert[];
  services: { name: string; status: Status; cpu: number; memory: number; uptime: string }[];
}

export interface Alert {
  id: string;
  title: string;
  severity: 'critical' | 'warning' | 'info';
  source: string;
  status: 'active' | 'resolved';
  triggered: string;
  details: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
  twoFactor: boolean;
  lastLogin: string;
}

export interface Audit {
  id: string;
  time: string;
  user: string;
  action: string;
  resource: string;
  details: string;
  status: 'success' | 'failed' | 'warning';
  ip: string;
}
