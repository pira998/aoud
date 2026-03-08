import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './styles/terminal.css';

const rootElement = document.getElementById('root')!;
const root = ReactDOM.createRoot(rootElement);

// Only use StrictMode in development
// In production, avoid double-rendering effects that cause duplicate WebSocket connections
if (import.meta.env.DEV) {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  root.render(<App />);
}
