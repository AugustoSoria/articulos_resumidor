/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export estatico: `next build` deja HTML, CSS y JS sueltos en out/, sin
  // necesitar un servidor Node. Es lo que permite servirlo desde S3.
  output: "export",
  // S3 no resuelve /ruta -> /ruta/index.html por su cuenta. Con esto los
  // enlaces generados terminan en barra y coinciden con los objetos del bucket.
  trailingSlash: true,
  // La optimizacion de imagenes de Next necesita un servidor; en un export
  // estatico no existe.
  images: { unoptimized: true },
};

export default nextConfig;
