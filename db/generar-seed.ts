/**
 * Genera db/seed.sql con datos de prueba realistas para la demo.
 *
 *   node db/generar-seed.ts
 *
 * Las contraseñas se hashean con el MISMO modulo que despues usa el login del
 * Worker (src/api/password.ts). Por eso este script existe: si el seed definiera
 * su propio hash, el login no podria validarlo.
 *
 * Todas las fechas se escriben como expresiones relativas de SQLite
 * (datetime('now','-N days')), asi el seed no envejece.
 */
import { writeFileSync } from 'node:fs';
import { hashPassword } from '../src/api/password.ts';

const PASSWORD_DEMO = 'demo1234';

// PRNG con semilla fija: la misma corrida produce el mismo seed.sql.
let semilla = 20260818;
function azar(): number {
  semilla |= 0;
  semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const entre = (min: number, max: number) => Math.floor(azar() * (max - min + 1)) + min;
const unoDe = <T,>(xs: readonly T[]): T => xs[Math.floor(azar() * xs.length)];

const esc = (s: string) => s.replace(/'/g, "''");
const txt = (s: string | null) => (s === null ? 'NULL' : "'" + esc(s) + "'");
const haceDias = (n: number) => "datetime('now','-" + n + " days')";
const fechaHace = (n: number) => "date('now','-" + n + " days')";
const fechaEn = (n: number) => "date('now','+" + n + " days')";
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------------------------------------------------------------------------
//  Usuarios: el dueño + los 4 vendedores de la calle
// ---------------------------------------------------------------------------
const USUARIOS = [
  { id: 1, nombre: 'Gustavo Methol', email: 'gustavo@scalerics.com.uy', rol: 'admin' },
  { id: 2, nombre: 'Martin Piriz', email: 'martin@scalerics.com.uy', rol: 'vendedor' },
  { id: 3, nombre: 'Lucia Bentancor', email: 'lucia@scalerics.com.uy', rol: 'vendedor' },
  { id: 4, nombre: 'Rodrigo Cabrera', email: 'rodrigo@scalerics.com.uy', rol: 'vendedor' },
  { id: 5, nombre: 'Valeria Sosa', email: 'valeria@scalerics.com.uy', rol: 'vendedor' },
];

// ---------------------------------------------------------------------------
//  Clientes
//    ven    = vendedor_id (cada vendedor tiene su zona)
//    dias   = dias desde la ultima interaccion -> define el semaforo
//    compra = dias desde el ultimo pedido confirmado; null = nunca compro
//
//  Los valores estan elegidos a proposito, no al azar:
//    - 10 clientes con mas de 60 dias sin contacto -> pantalla de riesgo
//    - varios con contacto reciente pero compra vieja -> justifican la segunda
//      metrica, que es textualmente lo que pidio el cliente
// ---------------------------------------------------------------------------
type Cli = {
  razon: string;
  fantasia: string;
  rubro: string;
  ciudad: string;
  dir: string;
  ven: number;
  estado: 'activo' | 'prospecto' | 'inactivo';
  dias: number;
  compra: number | null;
};

const CLIENTES: Cli[] = [
  { razon: 'Hoteleria Costa Azul S.A.', fantasia: 'Hotel Costa Azul', rubro: 'Hoteleria', ciudad: 'Montevideo', dir: 'Rambla Republica del Peru 1425', ven: 3, estado: 'activo', dias: 6, compra: 214 },
  { razon: 'Alturas del Prado S.R.L.', fantasia: 'Hotel Alturas', rubro: 'Hoteleria', ciudad: 'Montevideo', dir: 'Av. Buschental 2140', ven: 2, estado: 'activo', dias: 42, compra: 51 },
  { razon: 'Solymar Resort S.A.', fantasia: 'Hotel Solymar', rubro: 'Hoteleria', ciudad: 'Solymar', dir: 'Av. Giannattasio Km 22', ven: 5, estado: 'activo', dias: 12, compra: 34 },
  { razon: 'Posada del Puerto S.R.L.', fantasia: 'Posada del Puerto', rubro: 'Hoteleria', ciudad: 'Montevideo', dir: 'Perez Castellano 1483', ven: 2, estado: 'activo', dias: 19, compra: 27 },
  { razon: 'Sanatorio San Rafael S.A.', fantasia: 'Sanatorio San Rafael', rubro: 'Salud', ciudad: 'Montevideo', dir: 'Av. 8 de Octubre 3290', ven: 2, estado: 'activo', dias: 112, compra: 240 },
  { razon: 'Centro Medico Artigas S.R.L.', fantasia: 'Policlinica Artigas', rubro: 'Salud', ciudad: 'Montevideo', dir: 'Bulevar Artigas 1560', ven: 2, estado: 'activo', dias: 8, compra: 22 },
  { razon: 'Instituto Odontologico del Este S.R.L.', fantasia: 'Odontologico del Este', rubro: 'Salud', ciudad: 'Montevideo', dir: 'Av. Bolivia 2035', ven: 4, estado: 'prospecto', dias: 14, compra: null },
  { razon: 'Laboratorio Bioclin S.A.', fantasia: 'Bioclin', rubro: 'Salud', ciudad: 'Montevideo', dir: 'Bulevar Artigas 1825', ven: 4, estado: 'activo', dias: 21, compra: 40 },
  { razon: 'Colegio Santa Elena S.R.L.', fantasia: 'Colegio Santa Elena', rubro: 'Educacion', ciudad: 'Montevideo', dir: 'Ellauri 745', ven: 3, estado: 'activo', dias: 168, compra: 195 },
  { razon: 'Institucion Educativa Los Robles S.R.L.', fantasia: 'Colegio Los Robles', rubro: 'Educacion', ciudad: 'Montevideo', dir: 'Av. Alfredo Arocena 1680', ven: 4, estado: 'activo', dias: 9, compra: 18 },
  { razon: 'Escuela Tecnica del Sur S.R.L.', fantasia: 'Escuela Tecnica del Sur', rubro: 'Educacion', ciudad: 'La Paz', dir: 'Av. Instrucciones 3410', ven: 5, estado: 'prospecto', dias: 25, compra: null },
  { razon: 'Jardin Infantil Girasoles S.R.L.', fantasia: 'Jardin Girasoles', rubro: 'Educacion', ciudad: 'Montevideo', dir: 'Michigan 1290', ven: 4, estado: 'activo', dias: 128, compra: 160 },
  { razon: 'Parrillada El Fogon del Puerto S.R.L.', fantasia: 'El Fogon del Puerto', rubro: 'Gastronomia', ciudad: 'Montevideo', dir: 'Piedras 237', ven: 2, estado: 'activo', dias: 5, compra: 16 },
  { razon: 'Gastronomia Rambla S.A.', fantasia: 'Bistro Rambla', rubro: 'Gastronomia', ciudad: 'Montevideo', dir: 'Rambla Gandhi 633', ven: 3, estado: 'activo', dias: 37, compra: 44 },
  { razon: 'Panificadora La Espiga S.R.L.', fantasia: 'Panaderia La Espiga', rubro: 'Gastronomia', ciudad: 'Montevideo', dir: 'Colonia 1876', ven: 2, estado: 'activo', dias: 3, compra: 11 },
  { razon: 'Cantina Don Vito S.R.L.', fantasia: 'Cantina Don Vito', rubro: 'Gastronomia', ciudad: 'Montevideo', dir: 'San Jose 1124', ven: 2, estado: 'inactivo', dias: 145, compra: 280 },
  { razon: 'Catering Sabores del Plata S.A.', fantasia: 'Sabores del Plata', rubro: 'Gastronomia', ciudad: 'Montevideo', dir: 'Av. Luis A. de Herrera 1248', ven: 4, estado: 'activo', dias: 11, compra: 191 },
  { razon: 'Fitness Center Pocitos S.R.L.', fantasia: 'GymPocitos', rubro: 'Deportes', ciudad: 'Montevideo', dir: 'Av. Brasil 2740', ven: 3, estado: 'activo', dias: 7, compra: 20 },
  { razon: 'Club de Entrenamiento Malvin S.R.L.', fantasia: 'Entrena Malvin', rubro: 'Deportes', ciudad: 'Montevideo', dir: 'Av. Rivera 4290', ven: 4, estado: 'activo', dias: 55, compra: 62 },
  { razon: 'Academia Aqua Vida S.R.L.', fantasia: 'Aqua Vida', rubro: 'Deportes', ciudad: 'Montevideo', dir: 'Julio Herrera y Reissig 620', ven: 3, estado: 'prospecto', dias: 17, compra: null },
  { razon: 'Administradora Torres del Puerto S.A.', fantasia: 'Torres del Puerto', rubro: 'Oficinas', ciudad: 'Montevideo', dir: 'Juan Lindolfo Cuestas 1523', ven: 2, estado: 'activo', dias: 13, compra: 29 },
  { razon: 'Complejo Empresarial Aguada S.A.', fantasia: 'Aguada Park Oficinas', rubro: 'Oficinas', ciudad: 'Montevideo', dir: 'Paraguay 2141', ven: 2, estado: 'activo', dias: 97, compra: 130 },
  { razon: 'Administracion Edificio Libertador S.R.L.', fantasia: 'Edificio Libertador', rubro: 'Oficinas', ciudad: 'Montevideo', dir: 'Av. del Libertador 1636', ven: 2, estado: 'activo', dias: 4, compra: 14 },
  { razon: 'Consorcio Torre Pocitos S.R.L.', fantasia: 'Torre Pocitos', rubro: 'Oficinas', ciudad: 'Montevideo', dir: 'Av. Sarmiento 2340', ven: 3, estado: 'activo', dias: 59, compra: 66 },
  { razon: 'Club Social y Deportivo Las Piedras', fantasia: 'Club Las Piedras', rubro: 'Deportes', ciudad: 'Las Piedras', dir: 'Av. Jose Artigas 640', ven: 5, estado: 'activo', dias: 16, compra: 38 },
  { razon: 'Club Nautico Punta Gorda S.R.L.', fantasia: 'Nautico Punta Gorda', rubro: 'Deportes', ciudad: 'Montevideo', dir: 'Rambla O Higgins 5290', ven: 4, estado: 'activo', dias: 91, compra: 105 },
  { razon: 'Complejo Deportivo El Pinar S.R.L.', fantasia: 'Deportivo El Pinar', rubro: 'Deportes', ciudad: 'El Pinar', dir: 'Av. Racine 1120', ven: 5, estado: 'prospecto', dias: 22, compra: null },
  { razon: 'Residencial Los Aromos S.R.L.', fantasia: 'Residencial Los Aromos', rubro: 'Residencial', ciudad: 'Montevideo', dir: 'Av. Agraciada 3455', ven: 4, estado: 'activo', dias: 10, compra: 24 },
  { razon: 'Casa de Salud Santa Rita S.R.L.', fantasia: 'Casa de Salud Santa Rita', rubro: 'Residencial', ciudad: 'Montevideo', dir: 'Joaquin Nunez 2812', ven: 3, estado: 'inactivo', dias: 203, compra: 320 },
  { razon: 'Residencial Atardecer S.R.L.', fantasia: 'Residencial Atardecer', rubro: 'Residencial', ciudad: 'Atlantida', dir: 'Calle 11 esq. Rambla', ven: 5, estado: 'activo', dias: 48, compra: 57 },
  { razon: 'Frigorifico Costa Norte S.A.', fantasia: 'Frigorifico Costa Norte', rubro: 'Industria', ciudad: 'Canelones', dir: 'Ruta 5 Km 32', ven: 5, estado: 'activo', dias: 118, compra: 133 },
  { razon: 'Supermercados La Canasta S.R.L.', fantasia: 'Super La Canasta', rubro: 'Comercio', ciudad: 'Pando', dir: 'Jose Batlle y Ordonez 780', ven: 5, estado: 'activo', dias: 4, compra: 238 },
  { razon: 'Lavadero Industrial Clean Pro S.R.L.', fantasia: 'Clean Pro', rubro: 'Industria', ciudad: 'La Paz', dir: 'Ruta 5 Km 24.500', ven: 4, estado: 'activo', dias: 26, compra: 33 },
  { razon: 'Textil Uruguaya del Este S.A.', fantasia: 'Textil del Este', rubro: 'Industria', ciudad: 'Las Piedras', dir: 'Av. Instrucciones 4820', ven: 5, estado: 'inactivo', dias: 176, compra: 260 },
  { razon: 'Distribuidora Via Lactea S.R.L.', fantasia: 'Via Lactea', rubro: 'Comercio', ciudad: 'Progreso', dir: 'Ruta 5 Km 29', ven: 5, estado: 'prospecto', dias: 20, compra: null },
  { razon: 'Costa Shopping S.A.', fantasia: 'Costa Shopping', rubro: 'Comercio', ciudad: 'Ciudad de la Costa', dir: 'Av. Giannattasio Km 20.500', ven: 5, estado: 'activo', dias: 2, compra: 9 },
  { razon: 'Cine Teatro Plaza S.R.L.', fantasia: 'Cine Teatro Plaza', rubro: 'Comercio', ciudad: 'Montevideo', dir: 'Av. 18 de Julio 1710', ven: 4, estado: 'activo', dias: 33, compra: 47 },
  { razon: 'Estacion de Servicio Ruta 8 S.R.L.', fantasia: 'Servicentro Ruta 8', rubro: 'Comercio', ciudad: 'Pando', dir: 'Ruta 8 Km 32.200', ven: 5, estado: 'prospecto', dias: 28, compra: null },
  { razon: 'Bodega Cerro Chato S.R.L.', fantasia: 'Bodega Cerro Chato', rubro: 'Industria', ciudad: 'Canelones', dir: 'Camino de los Vinos s/n', ven: 5, estado: 'activo', dias: 154, compra: 172 },
  { razon: 'Centro de Convenciones Rambla Sur S.A.', fantasia: 'Convenciones Rambla Sur', rubro: 'Oficinas', ciudad: 'Montevideo', dir: 'Rambla Wilson 1320', ven: 3, estado: 'prospecto', dias: 15, compra: null },
];

// ---------------------------------------------------------------------------
//  Vocabulario del rubro. Sin esto la demo parece un ejercicio de facultad.
// ---------------------------------------------------------------------------
const NOMBRES = ['Andrea Rodriguez', 'Sebastian Fernandez', 'Mariana Techera', 'Diego Olivera', 'Carolina Suarez', 'Nicolas Ferreira', 'Paola Machado', 'Alvaro Gimenez', 'Silvana Cardozo', 'Fernando Rivas', 'Natalia Pereira', 'Gonzalo Melgar', 'Adriana Lopez', 'Javier Mendez', 'Romina Acosta', 'Pablo Duarte', 'Veronica Silveira', 'Marcelo Nunez', 'Cecilia Barrios', 'Leonardo Pintos'];
const CARGOS = ['Encargado de compras', 'Administrador', 'Gerente general', 'Jefe de mantenimiento', 'Encargada de limpieza', 'Recepcion', 'Duenio'];
const TIPOS = ['llamada', 'llamada', 'llamada', 'visita', 'visita', 'whatsapp', 'whatsapp', 'email'];
// Mismo vocabulario que los botones del formulario (registrar-contacto.ts)
const RESULTADOS = ['Compro', 'Pidio precio', 'Lo va a pensar', 'No estaba', 'Reclamo'];
const NOTAS = [
  'Repuso stock de detergente industrial y papel higienico institucional.',
  'Pidio cotizacion por 20 bidones de hipoclorito de 5 litros.',
  'Se quejo del plazo de entrega de la ultima orden.',
  'Consulto por jabon liquido para dispenser y toallas en rollo.',
  'Compra mensual habitual: bolsas de residuo, lampazos y trapos de piso.',
  'Interesado en cambiar de proveedor, hoy le compra a la competencia.',
  'Pidio muestra de desengrasante para cocina industrial.',
  'Quedo en pasar el pedido cuando cierre el presupuesto del trimestre.',
  'Necesita dispensers nuevos para los banios del segundo piso.',
  'Aumenta el consumo en temporada alta, avisa en setiembre.',
  'Pregunto por alcohol en gel institucional por bidon.',
  'Coordinamos entrega para la primera semana del mes que viene.',
];
const PROXIMAS = ['Llamar', 'Visitar', 'Pasar precio'];
const MOTIVOS = ['Precio: la competencia cotizo mas barato', 'Se quedo con el proveedor actual', 'Postergo la compra para el proximo ejercicio', 'No hubo respuesta despues del presupuesto'];

// ---------------------------------------------------------------------------
//  Armado del SQL
// ---------------------------------------------------------------------------
const sql: string[] = [];

sql.push(
  '-- ============================================================================\n' +
    '--  CRM Scalerics - datos de prueba para la demo\n' +
    '--\n' +
    '--  GENERADO POR db/generar-seed.ts - no editar a mano, se regenera.\n' +
    '--\n' +
    '--  Todas las fechas son relativas a hoy: el seed no envejece.\n' +
    '--  Contrasenia de todos los usuarios: ' + PASSWORD_DEMO + '\n' +
    '--\n' +
    '--  Aplicar:\n' +
    '--    npx wrangler d1 execute scalerics-crm --local  --file=./db/seed.sql\n' +
    '--    npx wrangler d1 execute scalerics-crm --remote --file=./db/seed.sql\n' +
    '-- ============================================================================\n' +
    '\n' +
    '-- Limpieza previa, en orden de dependencias. Permite re-aplicar el seed.\n' +
    'DELETE FROM alertas;\n' +
    'DELETE FROM pedido_items;\n' +
    'DELETE FROM pedidos;\n' +
    'DELETE FROM interacciones;\n' +
    'DELETE FROM contactos;\n' +
    'DELETE FROM clientes;\n' +
    'DELETE FROM productos;\n' +
    'DELETE FROM usuarios;',
);

// --- usuarios ---
sql.push('\n-- ---------- usuarios ----------');
for (const u of USUARIOS) {
  const hash = await hashPassword(PASSWORD_DEMO);
  sql.push(
    'INSERT INTO usuarios (id, nombre, email, password_hash, rol, activo, creado_en) VALUES (' +
      [u.id, txt(u.nombre), txt(u.email), txt(hash), txt(u.rol), 1, haceDias(entre(400, 900))].join(', ') +
      ');',
  );
}

// --- clientes ---
sql.push('\n-- ---------- clientes ----------');
const antiguedad: number[] = [];
CLIENTES.forEach((c, i) => {
  const id = i + 1;
  const rut = '21' + String(entre(1000000000, 9999999999));
  const creado = c.dias + entre(220, 700);
  antiguedad[id] = creado;
  sql.push(
    'INSERT INTO clientes (id, razon_social, nombre_fantasia, rut, direccion, ciudad, rubro, vendedor_id, estado, eliminado, creado_en, creado_por) VALUES (' +
      [id, txt(c.razon), txt(c.fantasia), txt(rut), txt(c.dir), txt(c.ciudad), txt(c.rubro), c.ven, txt(c.estado), 0, haceDias(creado), 1].join(', ') +
      ');',
  );
});

// --- contactos ---
sql.push('\n-- ---------- contactos ----------');
let idContacto = 0;
CLIENTES.forEach((c, i) => {
  const clienteId = i + 1;
  const cuantos = azar() < 0.45 ? 2 : 1;
  const dominio = sinTildes(c.fantasia).toLowerCase().replace(/[^a-z]/g, '');
  for (let k = 0; k < cuantos; k++) {
    const tel = '09' + String(entre(1000000, 9999999));
    const nombre = unoDe(NOMBRES);
    const email = sinTildes(nombre).toLowerCase().replace(/ /g, '.') + '@' + dominio + '.com.uy';
    sql.push(
      'INSERT INTO contactos (id, cliente_id, nombre, cargo, telefono, whatsapp, email, es_principal) VALUES (' +
        [++idContacto, clienteId, txt(nombre), txt(unoDe(CARGOS)), txt(tel), txt(tel), txt(email), k === 0 ? 1 : 0].join(', ') +
        ');',
    );
  }
});

// --- interacciones ---
// Se generan hacia atras desde la ultima: asi el MAX(fecha) de cada cliente
// es exactamente el valor de `dias` elegido arriba.
sql.push('\n-- ---------- interacciones ----------');
let idInteraccion = 0;
CLIENTES.forEach((c, i) => {
  const clienteId = i + 1;
  const cuantas = entre(3, 7);
  let dia = c.dias;
  for (let k = 0; k < cuantas; k++) {
    if (dia >= antiguedad[clienteId]) break;
    const conProxima = k === 0 && azar() < 0.6;
    sql.push(
      'INSERT INTO interacciones (id, cliente_id, usuario_id, tipo, fecha, resultado, notas, proxima_accion, proxima_accion_fecha, creado_en) VALUES (' +
        [
          ++idInteraccion,
          clienteId,
          c.ven,
          txt(unoDe(TIPOS)),
          haceDias(dia),
          txt(unoDe(RESULTADOS)),
          txt(unoDe(NOTAS)),
          conProxima ? txt(unoDe(PROXIMAS)) : 'NULL',
          conProxima ? fechaEn(entre(2, 20)) : 'NULL',
          haceDias(dia),
        ].join(', ') +
        ');',
    );
    dia += entre(12, 55);
  }
});


// ---------------------------------------------------------------------------
//  Catalogo de productos
//
//  Insumos de limpieza institucional con precios plausibles en pesos uruguayos.
//  El catalogo es lo que vuelve legible al pipeline: un pedido deja de ser
//  "$ 11.000" y pasa a ser "20 bidones de hipoclorito a $ 380".
// ---------------------------------------------------------------------------
type Prod = { codigo: string; nombre: string; categoria: string; unidad: string; precio: number };

const PRODUCTOS: Prod[] = [
  { codigo: 'QUI-001', nombre: 'Detergente industrial concentrado', categoria: 'Quimicos', unidad: 'Bidon 5 L', precio: 520 },
  { codigo: 'QUI-002', nombre: 'Hipoclorito de sodio 10%', categoria: 'Quimicos', unidad: 'Bidon 5 L', precio: 380 },
  { codigo: 'QUI-003', nombre: 'Desengrasante para cocina industrial', categoria: 'Quimicos', unidad: 'Bidon 5 L', precio: 690 },
  { codigo: 'QUI-004', nombre: 'Limpiavidrios', categoria: 'Quimicos', unidad: 'Bidon 5 L', precio: 450 },
  { codigo: 'QUI-005', nombre: 'Limpiador de pisos perfumado', categoria: 'Quimicos', unidad: 'Bidon 5 L', precio: 410 },
  { codigo: 'QUI-006', nombre: 'Alcohol en gel institucional', categoria: 'Quimicos', unidad: 'Bidon 5 L', precio: 780 },
  { codigo: 'QUI-007', nombre: 'Desinfectante amonio cuaternario', categoria: 'Quimicos', unidad: 'Bidon 5 L', precio: 950 },
  { codigo: 'QUI-008', nombre: 'Jabon liquido para dispenser', categoria: 'Quimicos', unidad: 'Bidon 5 L', precio: 560 },
  { codigo: 'QUI-009', nombre: 'Cera autobrillante', categoria: 'Quimicos', unidad: 'Bidon 5 L', precio: 840 },
  { codigo: 'QUI-010', nombre: 'Quitasarro para baños', categoria: 'Quimicos', unidad: 'Bidon 5 L', precio: 470 },

  { codigo: 'PAP-001', nombre: 'Papel higienico institucional 300 m', categoria: 'Papel', unidad: 'Paquete x 8', precio: 1180 },
  { codigo: 'PAP-002', nombre: 'Papel higienico hoja simple', categoria: 'Papel', unidad: 'Paquete x 4', precio: 340 },
  { codigo: 'PAP-003', nombre: 'Toalla en rollo para dispenser 100 m', categoria: 'Papel', unidad: 'Paquete x 6', precio: 1450 },
  { codigo: 'PAP-004', nombre: 'Toalla intercalada', categoria: 'Papel', unidad: 'Paquete x 250', precio: 290 },
  { codigo: 'PAP-005', nombre: 'Servilletas', categoria: 'Papel', unidad: 'Paquete x 500', precio: 210 },

  { codigo: 'BOL-001', nombre: 'Bolsa de residuo 60x90', categoria: 'Bolsas', unidad: 'Paquete x 100', precio: 620 },
  { codigo: 'BOL-002', nombre: 'Bolsa de residuo 90x120 reforzada', categoria: 'Bolsas', unidad: 'Paquete x 100', precio: 980 },
  { codigo: 'BOL-003', nombre: 'Bolsa de residuo 45x60', categoria: 'Bolsas', unidad: 'Paquete x 100', precio: 380 },

  { codigo: 'ACC-001', nombre: 'Lampazo industrial con mango', categoria: 'Accesorios', unidad: 'Unidad', precio: 540 },
  { codigo: 'ACC-002', nombre: 'Repuesto de lampazo', categoria: 'Accesorios', unidad: 'Unidad', precio: 230 },
  { codigo: 'ACC-003', nombre: 'Trapo de piso', categoria: 'Accesorios', unidad: 'Paquete x 3', precio: 190 },
  { codigo: 'ACC-004', nombre: 'Franela multiuso', categoria: 'Accesorios', unidad: 'Paquete x 6', precio: 260 },
  { codigo: 'ACC-005', nombre: 'Escurridor de vidrios 45 cm', categoria: 'Accesorios', unidad: 'Unidad', precio: 610 },
  { codigo: 'ACC-006', nombre: 'Balde escurridor 20 L', categoria: 'Accesorios', unidad: 'Unidad', precio: 1350 },
  { codigo: 'ACC-007', nombre: 'Cepillo de mano', categoria: 'Accesorios', unidad: 'Unidad', precio: 180 },

  { codigo: 'PRO-001', nombre: 'Guantes de latex descartables', categoria: 'Proteccion', unidad: 'Caja x 100', precio: 480 },
  { codigo: 'PRO-002', nombre: 'Guantes de goma reforzados', categoria: 'Proteccion', unidad: 'Par', precio: 150 },

  { codigo: 'DIS-001', nombre: 'Dispenser de jabon liquido 1 L', categoria: 'Dispensers', unidad: 'Unidad', precio: 890 },
  { codigo: 'DIS-002', nombre: 'Dispenser de papel higienico institucional', categoria: 'Dispensers', unidad: 'Unidad', precio: 1240 },
  { codigo: 'DIS-003', nombre: 'Dispenser de toalla en rollo', categoria: 'Dispensers', unidad: 'Unidad', precio: 1390 },
];

sql.push('\n-- ---------- productos ----------');
PRODUCTOS.forEach((p, i) => {
  sql.push(
    'INSERT INTO productos (id, codigo, nombre, categoria, unidad, precio_lista, activo) VALUES (' +
      [i + 1, txt(p.codigo), txt(p.nombre), txt(p.categoria), txt(p.unidad), p.precio, 1].join(', ') +
      ');',
  );
});

// ---------------------------------------------------------------------------
//  Pedidos
//
//  Cada rubro compra lo suyo: un hotel repone papel y jabon todos los meses, un
//  frigorifico compra hipoclorito y desengrasante por volumen. Sin esto los
//  pedidos parecen sorteados y no se entiende que vende la empresa.
//
//  La fecha del pedido MAS RECIENTE de cada cliente es exactamente su valor de
//  `compra`. De ahi sale "dias sin compra", asi que los tres casos que hacen
//  entendible la pantalla de riesgo dependen de esto.
// ---------------------------------------------------------------------------
const codigo = (c: string) => PRODUCTOS.findIndex((p) => p.codigo === c) + 1;

const AFINIDAD: Record<string, string[]> = {
  Hoteleria: ['PAP-001', 'PAP-003', 'QUI-008', 'QUI-005', 'BOL-001', 'QUI-010', 'ACC-003'],
  Salud: ['QUI-007', 'QUI-006', 'PAP-001', 'PRO-001', 'BOL-002', 'QUI-002', 'PAP-004'],
  Educacion: ['QUI-008', 'PAP-002', 'QUI-005', 'BOL-001', 'ACC-003', 'PAP-004', 'ACC-001'],
  Gastronomia: ['QUI-003', 'QUI-001', 'BOL-002', 'PAP-005', 'PRO-001', 'QUI-002', 'ACC-004'],
  Deportes: ['QUI-005', 'QUI-007', 'PAP-001', 'BOL-001', 'QUI-006', 'QUI-008', 'ACC-001'],
  Oficinas: ['PAP-001', 'PAP-004', 'QUI-008', 'QUI-004', 'BOL-003', 'ACC-005', 'ACC-004'],
  Residencial: ['PAP-001', 'QUI-008', 'QUI-007', 'ACC-001', 'BOL-001', 'PAP-004', 'QUI-010'],
  Industria: ['QUI-002', 'QUI-003', 'BOL-002', 'PRO-002', 'ACC-006', 'QUI-001', 'PRO-001'],
  Comercio: ['BOL-001', 'QUI-005', 'PAP-001', 'ACC-004', 'QUI-004', 'PAP-005', 'ACC-003'],
};

/** Cantidades tipicas segun lo que es el producto. */
function cantidadDe(cod: string): number {
  if (cod.startsWith('DIS')) return entre(1, 4); // los dispensers se compran de a pocos
  if (cod.startsWith('ACC') || cod.startsWith('PRO')) return entre(2, 10);
  if (cod.startsWith('PAP') || cod.startsWith('BOL')) return entre(4, 25);
  return entre(3, 20); // quimicos
}

sql.push('\n-- ---------- pedidos ----------');
let idPedido = 0;
let idItem = 0;
let renglonesTotales = 0;

CLIENTES.forEach((c, i) => {
  if (c.compra === null) return; // los prospectos nunca compraron
  const clienteId = i + 1;
  const catalogo = AFINIDAD[c.rubro] ?? AFINIDAD['Comercio'];

  // Entre 3 y 7 compras hacia atras, arrancando por la mas reciente.
  const cuantos = entre(3, 7);
  let dia = c.compra;

  for (let k = 0; k < cuantos; k++) {
    if (dia >= antiguedad[clienteId]) break;

    // El mas reciente puede estar todavia sin entregar; los viejos ya se
    // entregaron. Nunca se anula el ultimo: eso cambiaria los dias sin compra
    // del cliente y romperia los casos preparados para la demo.
    // El mas reciente puede estar confirmado y sin entregar. El umbral es
    // generoso a proposito: si ninguno cayera en 'confirmado', esa columna del
    // pipeline quedaria vacia en la demo.
    let estado = 'entregado';
    if (k === 0 && dia < 30) estado = 'confirmado';
    else if (k > 0 && azar() < 0.06) estado = 'anulado';

    sql.push(
      'INSERT INTO pedidos (id, cliente_id, vendedor_id, fecha, estado, notas, creado_por, creado_en) VALUES (' +
        [
          ++idPedido,
          clienteId,
          c.ven,
          fechaHace(dia),
          txt(estado),
          'NULL',
          c.ven,
          haceDias(dia),
        ].join(', ') +
        ');',
    );

    // 2 a 5 renglones, sin repetir producto dentro del mismo pedido.
    const cuantosItems = entre(2, 5);
    const usados = new Set<string>();
    for (let r = 0; r < cuantosItems; r++) {
      const cod = unoDe(catalogo);
      if (usados.has(cod)) continue;
      usados.add(cod);
      const prod = PRODUCTOS[codigo(cod) - 1];
      sql.push(
        'INSERT INTO pedido_items (id, pedido_id, producto_id, cantidad, precio_unitario) VALUES (' +
          [++idItem, idPedido, codigo(cod), cantidadDe(cod), prod.precio].join(', ') +
          ');',
      );
      renglonesTotales++;
    }

    dia += entre(25, 70);
  }
});

// ---------------------------------------------------------------------------
//  Presupuestos abiertos y perdidos
//
//  Son lo que se ve en el pipeline. Antes eran "oportunidades" con un monto
//  tipeado a mano; ahora son pedidos sin confirmar, con los mismos renglones
//  que cualquier venta. Por eso el monto de cada tarjeta del pipeline sale de
//  multiplicar cantidades por precios y guarda relacion con lo que ese cliente
//  compra de verdad.
// ---------------------------------------------------------------------------
const MOTIVOS_PERDIDA = [
  'La competencia cotizo mas barato',
  'Se quedo con el proveedor actual',
  'Postergo la compra para el proximo ejercicio',
  'No hubo respuesta despues del presupuesto',
];

sql.push('\n-- ---------- presupuestos abiertos y perdidos ----------');

/** Escribe los renglones de un pedido y devuelve cuantos puso. */
function renglonesPara(pedidoId: number, rubro: string): number {
  const catalogo = AFINIDAD[rubro] ?? AFINIDAD['Comercio'];
  const usados = new Set<string>();
  let puestos = 0;
  const cuantos = entre(2, 5);
  for (let r = 0; r < cuantos; r++) {
    const cod = unoDe(catalogo);
    if (usados.has(cod)) continue;
    usados.add(cod);
    const prod = PRODUCTOS[codigo(cod) - 1];
    sql.push(
      'INSERT INTO pedido_items (id, pedido_id, producto_id, cantidad, precio_unitario) VALUES (' +
        [++idItem, pedidoId, codigo(cod), cantidadDe(cod), prod.precio].join(', ') +
        ');',
    );
    puestos++;
  }
  return puestos;
}

// Solo clientes que no estan inactivos: no se presupuesta a quien dejo de operar.
const activos = CLIENTES.map((c, i) => ({ c, id: i + 1 })).filter((x) => x.c.estado !== 'inactivo');
let cursor = 0;
let presupuestos = 0;
let perdidos = 0;

for (let k = 0; k < 24; k++) {
  const { c, id } = activos[cursor++ % activos.length];
  const dia = entre(2, 70);
  sql.push(
    'INSERT INTO pedidos (id, cliente_id, vendedor_id, fecha, estado, notas, creado_por, creado_en) VALUES (' +
      [++idPedido, id, c.ven, fechaHace(dia), "'presupuesto'", 'NULL', c.ven, haceDias(dia)].join(', ') +
      ');',
  );
  renglonesTotales += renglonesPara(idPedido, c.rubro);
  presupuestos++;
}

for (let k = 0; k < 6; k++) {
  const { c, id } = activos[cursor++ % activos.length];
  // Dentro de los 60 dias que muestra el pipeline: un tablero con la columna
  // "Perdido" siempre vacia no cuenta la historia completa.
  const dia = entre(6, 55);
  sql.push(
    'INSERT INTO pedidos (id, cliente_id, vendedor_id, fecha, estado, notas, creado_por, creado_en) VALUES (' +
      [++idPedido, id, c.ven, fechaHace(dia), "'perdido'", txt(unoDe(MOTIVOS_PERDIDA)), c.ven, haceDias(dia)].join(', ') +
      ');',
  );
  renglonesTotales += renglonesPara(idPedido, c.rubro);
  perdidos++;
}

writeFileSync(new URL('./seed.sql', import.meta.url), sql.join('\n') + '\n');

console.log('db/seed.sql generado');
console.log('  usuarios      ' + USUARIOS.length);
console.log('  clientes      ' + CLIENTES.length);
console.log('  contactos     ' + idContacto);
console.log('  interacciones ' + idInteraccion);
console.log('  presupuestos  ' + presupuestos);
console.log('  perdidos      ' + perdidos);
console.log('  productos     ' + PRODUCTOS.length);
console.log('  pedidos       ' + idPedido);
console.log('  renglones     ' + renglonesTotales);
console.log('  clientes en riesgo (>60 dias sin contacto): ' + CLIENTES.filter((c) => c.dias > 60).length);
console.log('  clientes sin comprar hace mas de 180 dias : ' + CLIENTES.filter((c) => c.compra !== null && c.compra > 180).length);
console.log('  clientes por vendedor: ' + [2, 3, 4, 5].map((v) => v + '=' + CLIENTES.filter((c) => c.ven === v).length).join('  '));
