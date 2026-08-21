export function Card() {
  return (
    <div className="bg-neutral-bg p-4">
      {/* Colores quemados: deben quedar subrayados en Problems */}
      <p className="text-red-500">Error de validación</p>
      <button className="bg-blue-600 hover:bg-blue-700 border-gray-300">Guardar</button>

      {/* Tokens del theme: NO deben marcarse */}
      <p className="text-brand-danger">Error de validación (correcto)</p>
      <button className="bg-brand-primary text-neutral-bg">Guardar (correcto)</button>
    </div>
  );
}
