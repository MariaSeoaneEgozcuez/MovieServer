import { useState } from 'react';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const resp = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await resp.json();

      if (!resp.ok) throw new Error(data.error || 'Error login');
      const token = data.token;
      localStorage.setItem('token', token);
      onLogin(token);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Iniciar sesión</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <div>
        <label>Correo</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" />
      </div>
      <div>
        <label>Contraseña</label>
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" />
      </div>
      <button type="submit">Entrar</button>
    </form>
  );
}