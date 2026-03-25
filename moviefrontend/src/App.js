import { useState } from 'react';
import Login from './components/Login';
import Register from './components/Register';

function App() {
  const [jwt, setJwt] = useState(localStorage.getItem('token') || null);
  const [isRegistering, setIsRegistering] = useState(false);

  if (!jwt) {
    return (
      <div style={{ maxWidth: 400, margin: '0 auto', padding: 20 }}>
        {isRegistering ? (
          <>
            <Register onRegistered={() => setIsRegistering(false)} />
            <p>
              ¿Ya tienes cuenta?{' '}
              <button onClick={() => setIsRegistering(false)}>Iniciar sesión</button>
            </p>
          </>
        ) : (
          <>
            <Login onLogin={setJwt} />
            <p>
              ¿No tienes cuenta?{' '}
              <button onClick={() => setIsRegistering(true)}>Registrarse</button>
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1>Bienvenido</h1>
      <button onClick={() => { localStorage.removeItem('token'); setJwt(null); }}>
        Cerrar sesión
      </button>
      {/* luego la app de recomendación/mi perfil */}
    </div>
  );
}

export default App;