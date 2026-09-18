/**
 * Banco de repertorio: canciones ya montadas en ediciones anteriores.
 * Base inicial tomada del proyecto "Repertorio Musicala Fest 2025".
 *
 * Sirve como sugerencia al registrar participantes: autocompleta la obra
 * y rellena el género. No limita nada: se puede escribir cualquier otra obra.
 */

export const BANCO_REPERTORIO = [
  { titulo: "Cariñito", artista: "Los Latinos", genero: "Colombiano" },
  { titulo: "Happier", artista: "Marshmello", genero: "Electrónica" },
  { titulo: "Bella Ciao", artista: "Manu Pilas", genero: "Folklor" },
  { titulo: "Tú falta de querer", artista: "Mon Laferte", genero: "Pop" },
  { titulo: "Shape of You", artista: "Ed Sheeran", genero: "Pop" },
  { titulo: "All of Me", artista: "John Legend", genero: "Pop" },
  { titulo: "Accidentally in Love", artista: "Counting Crows", genero: "Pop Rock" },
  { titulo: "Bajo el Agua", artista: "Manuel Medrano", genero: "Pop Rock" },
  { titulo: "Ddu-Du Ddu-Du", artista: "BLACKPINK", genero: "K-Pop" },
  { titulo: "Calma", artista: "Pedro Capó", genero: "Reggaetón" },
  { titulo: "Loco", artista: "Beelé", genero: "Reggaetón" },
  { titulo: "Bailando", artista: "Enrique Iglesias", genero: "Reggaetón" },
  { titulo: "Mientras me curo del corazón", artista: "Karol G", genero: "Reggaetón" },
  { titulo: "Ai se eu te pego", artista: "Michel Teló", genero: "Reggaetón" },
  { titulo: "21 Guns", artista: "Green Day", genero: "Rock" },
  { titulo: "Back in Black", artista: "AC/DC", genero: "Rock" },
  { titulo: "Bittersweet Symphony", artista: "The Verve", genero: "Rock" },
  { titulo: "Boys Don't Cry", artista: "The Cure", genero: "Rock" },
  { titulo: "Californication", artista: "Red Hot Chili Peppers", genero: "Rock" },
  { titulo: "Afuera", artista: "Caifanes", genero: "Rock en español" }
];

export const GENEROS = [
  "Sin definir", "Clásico", "Colombiano", "Electrónica", "Folklor", "Infantil",
  "Gospel", "Jazz", "K-Pop", "Pop", "Pop Rock", "Reggaetón", "Rock", "Rock en español",
  "Salsa / tropical", "Banda sonora", "Otro"
];

/**
 * Unifica las mil formas de escribir un género ("reguetón?", "k pop", "POP ROCK").
 * Portado del proyecto Repertorio Musicala Fest 2025.
 */
export function normalizeGenre(value = "") {
  const s = String(value).toLowerCase().trim().replace(/\?+$/, "").replace(/\s+/g, " ");
  if (!s) return "Sin definir";
  if (/(reggaeton|reguet[oó]n)/.test(s)) return "Reggaetón";
  if (/k[\s-]?pop/.test(s)) return "K-Pop";
  if (/pop rock/.test(s)) return "Pop Rock";
  if (/rock en espa[nñ]ol/.test(s)) return "Rock en español";
  if (/electr[oó]nica/.test(s)) return "Electrónica";
  if (/folkl(or|ore)/.test(s)) return "Folklor";
  if (/cl[aá]sic/.test(s)) return "Clásico";
  if (/salsa|tropical|cumbia/.test(s)) return "Salsa / tropical";
  if (/banda sonora|soundtrack|ost/.test(s)) return "Banda sonora";
  if (/infantil/.test(s)) return "Infantil";
  if (/gospel/.test(s)) return "Gospel";
  if (/jazz/.test(s)) return "Jazz";
  if (/rock/.test(s)) return "Rock";
  if (/pop/.test(s)) return "Pop";
  if (/colombian/.test(s)) return "Colombiano";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Busca una obra del banco por su título (tolerante a mayúsculas y tildes). */
export function findRepertorio(titulo = "") {
  const key = String(titulo).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (!key) return null;
  return BANCO_REPERTORIO.find(song =>
    song.titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === key
  ) || null;
}
