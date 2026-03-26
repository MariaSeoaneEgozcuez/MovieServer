import { useState, useEffect } from 'react';
import Login from './components/Login';
import Register from './components/Register';
import './App.css';

function App() {
  const [token, setToken] = useState(null);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('token');
    if (saved) setToken(saved);
  }, []);

  const handleLogin = (jwtToken) => {
    setToken(jwtToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  if (!token) {
    return (
      <div className="auth-wrapper">
        {showRegister ? (
          <>
            <Register onRegistered={() => setShowRegister(false)} />
            <p>
              ¿Ya tienes cuenta?{' '}
              <button onClick={() => setShowRegister(false)}>Iniciar sesión</button>
            </p>
          </>
        ) : (
          <>
            <Login onLogin={handleLogin} />
            <p>
              ¿No tienes cuenta?{' '}
              <button onClick={() => setShowRegister(true)}>Registrarse</button>
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="App">
      <header>
        <h1>Bienvenido</h1>
        <button onClick={handleLogout}>Cerrar sesión</button>
      </header>
      <main>
        {/* Zona de películas, recomendaciones, etc. */}
      </main>
    </div>
  );
}

export default App;