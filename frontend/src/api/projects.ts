import { apiClient } from './client';

export interface Proyecto {
  id: number;
  package_base: string;
  create_at?: string;
  update_at?: string;
  last_edited_at?: string;
}

export interface DiagramaData {
  id?: number;
  nodes: any[];
  edges: any[];
  viewport: { x: number; y: number; zoom: number };
}

export interface ProyectoConDiagrama {
  proyecto: Proyecto;
  diagrama: DiagramaData;
}

export const projectsApi = {
  list: async (): Promise<Proyecto[]> => {
    const response = await apiClient.get<Proyecto[]>('/api/projects/');
    return response.data;
  },

  create: async (package_base?: string): Promise<ProyectoConDiagrama> => {
    const response = await apiClient.post<ProyectoConDiagrama>('/api/projects/', {
      package_base: package_base || 'com.example.uml',
    });
    return response.data;
  },

  getDiagrama: async (projectId: number): Promise<ProyectoConDiagrama> => {
    const response = await apiClient.get<ProyectoConDiagrama>(`/api/projects/${projectId}/diagrama/`);
    return response.data;
  },

  saveDiagrama: async (
    projectId: number,
    data: { nodes: any[]; edges: any[]; viewport?: any; package_base?: string }
  ): Promise<ProyectoConDiagrama> => {
    const response = await apiClient.put<ProyectoConDiagrama>(`/api/projects/${projectId}/diagrama/`, data);
    return response.data;
  },

  update: async (projectId: number, package_base: string): Promise<Proyecto> => {
    const response = await apiClient.put<Proyecto>(`/api/projects/${projectId}/`, { package_base });
    return response.data;
  },

  delete: async (projectId: number): Promise<void> => {
    await apiClient.delete(`/api/projects/${projectId}/`);
  },
};
