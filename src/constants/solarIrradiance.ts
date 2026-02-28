export const BRAZIL_STATES = [
  { uf: 'AC', name: 'Acre', irradiance: 4.5 },
  { uf: 'AL', name: 'Alagoas', irradiance: 5.3 },
  { uf: 'AP', name: 'Amapá', irradiance: 4.8 },
  { uf: 'AM', name: 'Amazonas', irradiance: 4.4 },
  { uf: 'BA', name: 'Bahia', irradiance: 5.5 },
  { uf: 'CE', name: 'Ceará', irradiance: 5.5 },
  { uf: 'DF', name: 'Distrito Federal', irradiance: 5.0 },
  { uf: 'ES', name: 'Espírito Santo', irradiance: 4.8 },
  { uf: 'GO', name: 'Goiás', irradiance: 5.2 },
  { uf: 'MA', name: 'Maranhão', irradiance: 5.2 },
  { uf: 'MT', name: 'Mato Grosso', irradiance: 5.0 },
  { uf: 'MS', name: 'Mato Grosso do Sul', irradiance: 5.0 },
  { uf: 'MG', name: 'Minas Gerais', irradiance: 5.2 },
  { uf: 'PA', name: 'Pará', irradiance: 4.6 },
  { uf: 'PB', name: 'Paraíba', irradiance: 5.5 },
  { uf: 'PR', name: 'Paraná', irradiance: 4.6 },
  { uf: 'PE', name: 'Pernambuco', irradiance: 5.4 },
  { uf: 'PI', name: 'Piauí', irradiance: 5.7 },
  { uf: 'RJ', name: 'Rio de Janeiro', irradiance: 4.7 },
  { uf: 'RN', name: 'Rio Grande do Norte', irradiance: 5.5 },
  { uf: 'RS', name: 'Rio Grande do Sul', irradiance: 4.3 },
  { uf: 'RO', name: 'Rondônia', irradiance: 4.6 },
  { uf: 'RR', name: 'Roraima', irradiance: 4.7 },
  { uf: 'SC', name: 'Santa Catarina', irradiance: 4.3 },
  { uf: 'SP', name: 'São Paulo', irradiance: 4.7 },
  { uf: 'SE', name: 'Sergipe', irradiance: 5.3 },
  { uf: 'TO', name: 'Tocantins', irradiance: 5.2 },
] as const;

export type BrazilUF = (typeof BRAZIL_STATES)[number]['uf'];

export function getIrradianceByUF(uf: string): number {
  return BRAZIL_STATES.find((s) => s.uf === uf)?.irradiance ?? 4.5;
}
