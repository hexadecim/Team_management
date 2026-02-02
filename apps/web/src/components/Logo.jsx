import React from 'react';
import logoImage from './aganya_logo.jpg';

const Logo = ({ size = 120 }) => {
    return (
        <img
            src={logoImage}
            alt="Logo"
            style={{
                display: 'block',
                margin: '0 auto',
                width: size,
                height: 'auto',
                mixBlendMode: 'multiply',
                filter: 'invert(1) contrast(1.5) brightness(1.5)',
                background: 'transparent'
            }}
        />
    );
};

export default Logo;
