import React, { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { useNavigationStore } from './store/navigationStore';
import { AuthPage } from './components/auth/AuthPage';
import { WelcomeDashboard } from './components/dashboard/WelcomeDashboard';
import { ProjectsListPage } from './components/projects/ProjectsListPage';
import { ClassDiagramEditor } from './components/editor/ClassDiagramEditor';

const App: React.FC = () => {
  const { isAuthenticated, initAuth } = useAuthStore();
  const { currentView } = useNavigationStore();

  useEffect(() => {
    initAuth();

    // Si la URL contiene el parámetro ?project=123 (enlace de colaboración compartido)
    const params = new URLSearchParams(window.location.search);
    const projParam = params.get('project');
    if (projParam) {
      const pId = parseInt(projParam, 10);
      if (!isNaN(pId)) {
        useNavigationStore.getState().navigateToEditor(pId);
      }
    }
  }, [initAuth]);

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#ffffff',
            color: '#0f172a',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
            fontSize: '14px',
            borderRadius: '12px',
          },
        }}
      />
      {!isAuthenticated ? (
        <AuthPage />
      ) : currentView === 'editor' ? (
        <ClassDiagramEditor />
      ) : currentView === 'projects' ? (
        <ProjectsListPage />
      ) : (
        <WelcomeDashboard />
      )}
    </>
  );
};

export default App;
