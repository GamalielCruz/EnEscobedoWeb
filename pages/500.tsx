export default function Custom500() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#f8f9fa',
    }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>500 – Error interno del servidor</h1>
      <p style={{ fontSize: '1.25rem', color: '#555' }}>Algo salió mal. Por favor, vuelve a intentarlo más tarde.</p>
    </div>
  );
}
