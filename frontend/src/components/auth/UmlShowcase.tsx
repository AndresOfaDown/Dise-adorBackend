import React, { useState } from 'react';

export const UmlShowcase: React.FC = () => {
  const [activeClass, setActiveClass] = useState<string>('Usuario');

  return (
    <div className="uml-showcase-container">
      {/* Brand & Tagline */}
      <div className="uml-brand-header">
        <div className="uml-brand-badge">
          <span className="badge-pulse"></span>
          <span>Modelado UML</span>
        </div>
        <h1 className="uml-brand-title">
          Diseña diagramas de clases con precisión
          <span className="gradient-text"> y en tiempo real.</span>
        </h1>
      </div>

      {/* Interactive UML Canvas Visualizer */}
      <div className="uml-canvas-preview">
        {/* Canvas grid background layer */}
        <div className="canvas-grid-overlay"></div>

        {/* Floating Class Diagram Cards */}
        <div className="uml-diagram-stage">
          {/* Class Card 1: Usuario */}
          <div
            className={`uml-class-card ${activeClass === 'Usuario' ? 'active-card' : ''}`}
            onClick={() => setActiveClass('Usuario')}
          >
            <div className="uml-card-header">
              <span className="uml-stereotype">&laquo;Entity&raquo;</span>
              <div className="uml-class-name-row">
                <span className="uml-icon-node">C</span>
                <span className="uml-class-name">Usuario</span>
              </div>
            </div>
            <div className="uml-card-section attributes">
              <div className="uml-item"><span className="visibility public">+</span> id: <span className="type">Long</span></div>
              <div className="uml-item"><span className="visibility public">+</span> nombre: <span className="type">String</span></div>
              <div className="uml-item"><span className="visibility public">+</span> email: <span className="type">String</span></div>
            </div>
            <div className="uml-card-section methods">
              <div className="uml-item"><span className="visibility public">+</span> login(email, pwd): <span className="type">Token</span></div>
              <div className="uml-item"><span className="visibility public">+</span> crearProyecto(): <span className="type">Proyecto</span></div>
            </div>
          </div>

          {/* Animated Connecting Line & Multiplicity */}
          <div className="uml-relation-line">
            <svg className="relation-svg" width="100%" height="60" viewBox="0 0 200 60">
              <defs>
                <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
              <line
                x1="20"
                y1="30"
                x2="175"
                y2="30"
                stroke="url(#lineGrad)"
                strokeWidth="2"
                strokeDasharray="4 4"
                className="animated-dash"
              />
              {/* UML Arrow Head */}
              <polygon points="175,25 190,30 175,35" fill="#06b6d4" />
              {/* Diamond origin for composition */}
              <polygon points="10,30 20,24 30,30 20,36" fill="#818cf8" stroke="#818cf8" />
            </svg>
            <div className="multiplicity-labels">
              <span className="mult-left">1</span>
              <span className="relation-name">1..* posee</span>
              <span className="mult-right">0..*</span>
            </div>
          </div>

          {/* Class Card 2: Proyecto */}
          <div
            className={`uml-class-card ${activeClass === 'Proyecto' ? 'active-card' : ''}`}
            onClick={() => setActiveClass('Proyecto')}
          >
            <div className="uml-card-header accent-cyan">
              <span className="uml-stereotype">&laquo;Aggregate&raquo;</span>
              <div className="uml-class-name-row">
                <span className="uml-icon-node cyan">C</span>
                <span className="uml-class-name">Proyecto</span>
              </div>
            </div>
            <div className="uml-card-section attributes">
              <div className="uml-item"><span className="visibility public">+</span> package_base: <span className="type">String</span></div>
              <div className="uml-item"><span className="visibility protected">#</span> last_edited_at: <span className="type">DateTime</span></div>
            </div>
            <div className="uml-card-section methods">
              <div className="uml-item"><span className="visibility public">+</span> exportarCodigo(lang): <span className="type">Zip</span></div>
              <div className="uml-item"><span className="visibility public">+</span> validarModelo(): <span className="type">Boolean</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
