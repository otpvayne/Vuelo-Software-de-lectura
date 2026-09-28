/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tauri sirve el export estático desde ./out
  output: 'export',
  images: { unoptimized: true },
  // Genera carpeta/index.html por ruta: lo resuelve igual el navegador y el protocolo de Tauri.
  trailingSlash: true,
  webpack: (config) => {
    // pdfjs-dist referencia `canvas` solo en Node; en el cliente no se usa.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
