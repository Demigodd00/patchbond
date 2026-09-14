import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './Workspace';
import './styles.css';
import './workspace.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
