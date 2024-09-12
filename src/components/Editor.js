import React, { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';

const Editor = () => {
    const canvasRef = useRef(null);
    const [selectedObject, setSelectedObject] = useState(null);
    const [textColor, setTextColor] = useState('#000000');
    const [fontFamily, setFontFamily] = useState('Arial');

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
            fill: '#000',
            fontFamily: 'Arial',
        });

        canvas.add(text);

        // Asignar objeto seleccionado cuando se hace clic
        canvas.on('selection:created', (e) => {
            setSelectedObject(e.target);
        });

        canvas.on('selection:updated', (e) => {
            setSelectedObject(e.target);
        });

        canvas.on('selection:cleared', () => {
            setSelectedObject(null);
        });

        canvasRef.current.fabric = canvas;
    }, []);

    const addText = () => {
        const canvas = canvasRef.current.fabric;
        const text = new fabric.Textbox('Nuevo texto', {
            left: 100,
            top: 100,
            width: 200,
            fontSize: 20,
            fill: '#000',
            fontFamily: 'Arial',
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

    const changeTextColor = (e) => {
        setTextColor(e.target.value);
        if (selectedObject && selectedObject.type === 'textbox') {
            selectedObject.set({ fill: e.target.value });
            canvasRef.current.fabric.renderAll();
        }
    };

    const changeFontFamily = (e) => {
        setFontFamily(e.target.value);
        if (selectedObject && selectedObject.type === 'textbox') {
            selectedObject.set({ fontFamily: e.target.value });
            canvasRef.current.fabric.renderAll();
        }
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

            {/* Controles para cambiar el color y la fuente */}
            {selectedObject && selectedObject.type === 'textbox' && (
                <div className="text-controls">
                    <label>
                        Color del texto:
                        <input type="color" value={textColor} onChange={changeTextColor} />
                    </label>
                    <label>
                        Fuente:
                        <select value={fontFamily} onChange={changeFontFamily}>
                            <option value="Arial">Arial</option>
                            <option value="Courier New">Courier New</option>
                            <option value="Times New Roman">Times New Roman</option>
                            <option value="Verdana">Verdana</option>
                        </select>
                    </label>
                </div>
            )}

            <canvas ref={canvasRef} id="canvas" />
        </div>
    );
};

const handleFileUpload = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    
    reader.onload = function (f) {
        const data = f.target.result;
        addImage(data); // Usamos la función addImage para cargar la imagen al lienzo
    };

    if (file) {
        reader.readAsDataURL(file);
    }
};

return (
    <div className="editor-container">
        {/* Otros botones y controles */}

        <input type="file" accept="image/*" onChange={handleFileUpload} />
        
        <canvas ref={canvasRef} id="canvas" />
    </div>
);


export default Editor;

