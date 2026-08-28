import React from 'react';
import hapagLloydLogo from './assets/hapag-lloyd-access-logo.png';

const pageStyle = {
  alignItems: 'center',
  background: '#000',
  boxSizing: 'border-box',
  color: '#fff',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'Arial, Helvetica, sans-serif',
  justifyContent: 'center',
  minHeight: '100dvh',
  padding: '32px 24px',
  textAlign: 'center',
  width: '100%',
};

const messageStyle = {
  fontSize: 'clamp(16px, 2vw, 22px)',
  fontWeight: 400,
  letterSpacing: '0.01em',
  lineHeight: 1.4,
  margin: 0,
};

const logoStyle = {
  display: 'block',
  height: 'auto',
  marginTop: '24px',
  maxWidth: '240px',
  width: '42vw',
};

export default function AccessBlock() {
  return (
    <main style={pageStyle}>
      <p style={messageStyle}>looking for a safe place to ship from...</p>
      <img src={hapagLloydLogo} alt="Hapag-Lloyd" style={logoStyle} />
    </main>
  );
}
