// src/components/Editor.js
import React, { useState } from 'react';

const Editor = () => {
    const [text, setText] = useState('');
    const [color, setColor] = useState('#000000');

    const handleTextChange = (e) => {
        setText(e.target.value);
    };

    const handleColorChange = (e) => {
        setColor(e.target.value);
    };

    const downloadDesign = () => {
        // Lógica de descarga aquí
        alert('Diseño descargado con éxito.');
    };

    return (
        <div className="editor-container">
            <h1>Editor de Diseño Web</h1>
            <div className="controls">
                <input
                    type="text"
                    placeholder="Escribe algo"
                    value={text}
                    onChange={handleTextChange}
                />
                <input type="color" value={color} onChange={handleColorChange} />
            </div>
            <div className="preview" style={{ color }}>
                {text}
            </div>
            <button onClick={downloadDesign}>Descargar Diseño</button>
        </div>
    );
};

export default Editor;
