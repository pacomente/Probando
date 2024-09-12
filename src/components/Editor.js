import React, { useEffect, useRef } from 'react';
import { fabric } from 'fabric';

const Editor = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = new fabric.Canvas(canvasRef.current, {
            height: 500,
            width: 800,
            backgroundColor: '#f3f3f3',
        });

        // Añadir un texto predeterminado
        const text = new fabric.Text('Escribe aquí', {
            left: 100,
            top: 100,
            fontSize: 30,
        });

        canvas.add(text);

        // Agregar más lógica de edición aquí, como imágenes y formas
    }, []);

    const addText = () => {
        const canvas = canvasRef.current.fabric;
        const text = new fabric.Textbox('Nuevo texto', {
            left: 100,
            top: 100,
            width: 200,
            fontSize: 20,
            fill: '#000',
        });
        canvas.add(text);
    };

    const addImage = (url) => {
        const canvas = canvasRef.current.fabric;
        fabric.Image.fromURL(url, (img) => {
            img.scale(0.5);
            canvas.add(img);
        });
    };

    const downloadCanvas = () => {
        const canvas = canvasRef.current.fabric;
        const dataURL = canvas.toDataURL({
            format: 'png',
            quality: 1,
        });
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = 'diseño.png';
        link.click();
    };

    return (
        <div className="editor-container">
            <h1>Editor de Diseño Avanzado</h1>
            <div>
                <button onClick={addText}>Añadir Texto</button>
                <button onClick={() => addImage('https://via.placeholder.com/150')}>Añadir Imagen</button>
                <button onClick={downloadCanvas}>Descargar Diseño</button>
            </div>
            <canvas ref={canvasRef} id="canvas" />
        </div>
    );
};

export default Editor;
