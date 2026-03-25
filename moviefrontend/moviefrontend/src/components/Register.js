import { useState } from 'react';

export default function Register({ onRegistered }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const resp = await fetch('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      const contentType = resp.headers.get('content-type') || '';
      let data = null;
      if (contentType.includes('application/json')) {
        data = await resp.json();
      } else {
        const text = await resp.text();
        throw new Error(`Respuesta no JSON del servidor: ${text.slice(0, 200)}`);
      }

      if (!resp.ok) throw new Error(data.error || 'Error al registrar');

      setSuccess('Registro correcto, ya puedes iniciar sesión.');
      setName('');
      setEmail('');
      setPassword('');

      if (onRegistered) onRegistered();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <h2>Crear cuenta</h2>
      {error && <p className="error-msg">{error}</p>}
      {success && <p className="success-msg">{success}</p>}
      <div className="form-group">
        <label>Nombre</label>
        <input value={name} onChange={e => setName(e.target.value)} type="text" required />
      </div>
      <div className="form-group">
        <label>Correo</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" required />
      </div>
      <div className="form-group">
        <label>Contraseña</label>
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" required />
      </div>
      <button type="submit">Registrar</button>
    </form>
  );
}