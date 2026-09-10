export function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // CAMBIO: WebP en vez de JPEG. A calidad equivalente, WebP
                // suele pesar 25-35% menos, y todos los navegadores que nos
                // importan (Chrome, Firefox, Safari 14+, Edge) lo soportan
                // sin problema al subir/mostrar la imagen después. La escala
                // de "quality" (0-1) funciona igual que con JPEG, así que el
                // valor por default (0.7) no necesita ajustarse.
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Error al comprimir la imagen'));
                    }
                }, 'image/webp', quality);
            };
            
            img.onerror = () => reject(new Error('Error al cargar la imagen'));
        };
        
        reader.onerror = () => reject(new Error('Error al leer el archivo'));
    });
}

export function createImagePreview(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => resolve(e.target.result);
    });
}
