export type UfCode =
  | 'AC' | 'AL' | 'AP' | 'AM' | 'BA' | 'CE' | 'DF' | 'ES' | 'GO' | 'MA'
  | 'MT' | 'MS' | 'MG' | 'PA' | 'PB' | 'PR' | 'PE' | 'PI' | 'RJ' | 'RN'
  | 'RS' | 'RO' | 'RR' | 'SC' | 'SP' | 'SE' | 'TO';

export const ENERGY_DISTRIBUTOR_OPTIONS = [
  'AME',
  'BOA VISTA',
  'CASTRO-DIS',
  'CEA',
  'CEDRAP',
  'CEDRI',
  'CEEE-D',
  'CEGERO',
  'CEJAMA',
  'CELESC',
  'CELETRO',
  'CEMIG-D',
  'CEMIRIM',
  'CEPRAG',
  'Ceraca',
  'CERAL ANITAPOLIS',
  'CERAL ARARUAMA',
  'CERAL-DIS',
  'CERBRANORTE',
  'CERCI',
  'CERCOS',
  'CEREJ',
  'CERES',
  'CERFOX',
  'CERGAL',
  'CERGAPA',
  'CERGRAL',
  'CERILUZ',
  'CERIM',
  'CERIPa',
  'CERIS',
  'CERMC',
  'CERMISSOES',
  'CERMOFUL',
  'CERNHE',
  'CERPALO',
  'CERPRO',
  'CERR',
  'CERRP',
  'CERSAD DISTRIBUI',
  'CERSUL',
  'CERTAJA',
  'CERTEL ENERGIA',
  'CERTHIL',
  'CERTREL',
  'CERVAM',
  'CETRIL',
  'CFLO',
  'CHESP',
  'CNEE',
  'COCEL',
  'CODESAM',
  'COELBA',
  'COOPERA',
  'COOPERALIANCA',
  'COOPERCOCAL',
  'COOPERLUZ',
  'COOPERMILA',
  'COOPERNORTE',
  'COOPERSUL',
  'COOPERZEM',
  'COORSEL',
  'COPEL-DIS',
  'COPREL',
  'COSERN',
  'CPFL JAGUARI',
  'CPFL LESTE PAULI',
  'CPFL MOCOCA',
  'CPFL Santa Cruz',
  'CPFL SUL PAULIST',
  'CPFL-PAULISTA',
  'CPFL-PIRATINING',
  'CRELUZ-D',
  'DCELT',
  'DEMEI',
  'DMED',
  'EAC',
  'EBO',
  'EDEVP',
  'EDP ES',
  'EDP SP',
  'EEB',
  'EFLJC',
  'EFLUL',
  'ELEKTRO',
  'ELETROCAR',
  'ELETROPAULO',
  'ELFSM',
  'EMR',
  'EMS',
  'EMT',
  'ENEL CE',
  'ENEL RJ',
  'ENF',
  'EPB',
  'EQUATORIAL AL',
  'EQUATORIAL GO',
  'EQUATORIAL MA',
  'EQUATORIAL PA',
  'EQUATORIAL PI',
  'ERO',
  'ESE',
  'ESS',
  'ETO',
  'HIDROPAN',
  'LIGHT SESA',
  'MUXENERGIA',
  'Neoenergia Brasilia',
  'Neoenergia PE',
  'PACTO ENERGIA PR',
  'RGE',
  'RGE SUL',
  'SULGIPE',
  'UHENPAL',
  // aliases/search-friendly
  'ENEL SP',
  'ENEL GO',
  'ENEL BRASIL',
  'NEOENERGIA',
  'CPFL',
  'EQUATORIAL',
] as const;

export const PRIMARY_DISTRIBUTOR_BY_UF: Record<UfCode, string> = {
  AC: 'EAC',
  AL: 'EQUATORIAL AL',
  AP: 'CEA',
  AM: 'AME',
  BA: 'COELBA',
  CE: 'ENEL CE',
  DF: 'Neoenergia Brasilia',
  ES: 'EDP ES',
  GO: 'EQUATORIAL GO',
  MA: 'EQUATORIAL MA',
  MT: 'EMT',
  MS: 'EMS',
  MG: 'CEMIG-D',
  PA: 'EQUATORIAL PA',
  PB: 'EPB',
  PR: 'COPEL-DIS',
  PE: 'Neoenergia PE',
  PI: 'EQUATORIAL PI',
  RJ: 'ENEL RJ',
  RN: 'COSERN',
  RS: 'RGE',
  RO: 'ERO',
  RR: 'BOA VISTA',
  SC: 'CELESC',
  SP: 'CPFL-PAULISTA',
  SE: 'ESE',
  TO: 'ETO',
};

export const ENERGY_DISTRIBUTORS_BY_UF: Record<UfCode, readonly string[]> = {
  AC: ['EAC'],
  AL: ['EQUATORIAL AL'],
  AP: ['CEA'],
  AM: ['AME'],
  BA: ['COELBA'],
  CE: ['ENEL CE'],
  DF: ['Neoenergia Brasilia'],
  ES: ['EDP ES'],
  GO: ['EQUATORIAL GO', 'ENEL GO'],
  MA: ['EQUATORIAL MA'],
  MT: ['EMT'],
  MS: ['EMS'],
  MG: ['CEMIG-D', 'DMED'],
  PA: ['EQUATORIAL PA'],
  PB: ['EPB'],
  PR: ['COPEL-DIS', 'COCEL'],
  PE: ['Neoenergia PE'],
  PI: ['EQUATORIAL PI'],
  RJ: ['ENEL RJ', 'LIGHT SESA'],
  RN: ['COSERN'],
  RS: ['RGE', 'RGE SUL', 'CEEE-D'],
  RO: ['ERO'],
  RR: ['BOA VISTA'],
  SC: ['CELESC', 'EFLJC', 'EFLUL', 'COOPERALIANCA', 'COOPERCAL'],
  SP: [
    'CPFL-PAULISTA',
    'CPFL-PIRATINING',
    'CPFL SUL PAULIST',
    'CPFL LESTE PAULI',
    'CPFL MOCOCA',
    'CPFL JAGUARI',
    'ELEKTRO',
    'ELETROPAULO',
    'ENEL SP',
    'EDP SP',
  ],
  SE: ['ESE'],
  TO: ['ETO'],
};

export const getEnergyDistributorOptionsByUf = (uf?: string | null): string[] => {
  const normalized = normalizeUf(uf);
  if (!normalized) return [];

  const seeded = ENERGY_DISTRIBUTORS_BY_UF[normalized] || [];
  const unique = new Set<string>(seeded);
  const primary = PRIMARY_DISTRIBUTOR_BY_UF[normalized];
  if (primary) unique.add(primary);

  return Array.from(unique);
};

// Source: ANEEL BDTarifas (B1 Convencional, Tarifa de Aplicação; dataset generation 2026-02-26).
// Values converted from R$/MWh to R$/kWh.
export const DEFAULT_TARIFF_BY_DISTRIBUTOR: Record<string, number> = {
  AME: 0.843,
  'BOA VISTA': 0.7895,
  CEA: 0.8083,
  CELESC: 0.2449,
  'CEMIG-D': 0.8586,
  COELBA: 0.8377,
  'COPEL-DIS': 0.6424,
  COSERN: 0.7442,
  'CPFL-PAULISTA': 0.6755,
  EAC: 0.8738,
  'EDP ES': 0.3461,
  ELETROPAULO: 0.7252,
  EMS: 0.8781,
  EMT: 0.8521,
  'ENEL CE': 0.7101,
  'ENEL RJ': 0.9254,
  EPB: 0.3519,
  'EQUATORIAL AL': 0.8081,
  'EQUATORIAL GO': 0.8918,
  'EQUATORIAL MA': 0.499,
  'EQUATORIAL PA': 0.6254,
  'EQUATORIAL PI': 0.9467,
  ERO: 0.8414,
  ESE: 0.7125,
  ETO: 0.9302,
  'LIGHT SESA': 0.8236,
  'Neoenergia PE': 0.7692,
  RGE: 0.8222,
  // Alias until explicit line appears in this dataset slice.
  'Neoenergia Brasilia': 0.8918,
};

type InferenceSource = 'manual' | 'city_uf' | 'uf' | 'cep_uf';
type InferenceConfidence = 'high' | 'medium' | 'low';

export interface DistributorInferenceInput {
  distributor?: string | null;
  uf?: string | null;
  city?: string | null;
  cep?: string | null;
}

export interface DistributorInferenceResult {
  distributor: string;
  uf: UfCode | null;
  source: InferenceSource;
  confidence: InferenceConfidence;
}

const UF_SET = new Set<UfCode>(Object.keys(PRIMARY_DISTRIBUTOR_BY_UF) as UfCode[]);

const normalizeText = (value: string) => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

const normalizeDistributorKey = (value: string) => value.trim().toLowerCase();

export const normalizeUf = (value?: string | null): UfCode | null => {
  const uf = String(value || '').trim().toUpperCase() as UfCode;
  return UF_SET.has(uf) ? uf : null;
};

const normalizeCepDigits = (cep?: string | null): string => String(cep || '').replace(/\D/g, '');

export const inferUfFromCep = (cep?: string | null): UfCode | null => {
  const digits = normalizeCepDigits(cep);
  if (digits.length < 5) return null;
  const prefix2 = Number(digits.slice(0, 2));
  if (!Number.isFinite(prefix2)) return null;

  // Official CEP ranges (approximation by first 2 digits + key overlaps).
  if (prefix2 >= 1 && prefix2 <= 19) return 'SP';
  if (prefix2 >= 20 && prefix2 <= 28) return 'RJ';
  if (prefix2 === 29) return 'ES';
  if (prefix2 >= 30 && prefix2 <= 39) return 'MG';
  if (prefix2 >= 40 && prefix2 <= 48) return 'BA';
  if (prefix2 === 49) return 'SE';
  if (prefix2 >= 50 && prefix2 <= 56) return 'PE';
  if (prefix2 === 57) return 'AL';
  if (prefix2 === 58) return 'PB';
  if (prefix2 === 59) return 'RN';
  if (prefix2 >= 60 && prefix2 <= 63) return 'CE';
  if (prefix2 === 64) return 'PI';
  if (prefix2 === 65) return 'MA';
  if (prefix2 >= 66 && prefix2 <= 68) return 'PA';
  if (prefix2 === 69) {
    const prefix3 = Number(digits.slice(0, 3));
    if (prefix3 >= 699) return 'AC';
    if (prefix3 >= 693 && prefix3 <= 693) return 'RR';
    return 'AM';
  }
  if (prefix2 >= 70 && prefix2 <= 72) return 'DF';
  if (prefix2 >= 73 && prefix2 <= 76) return 'GO';
  if (prefix2 === 77) return 'TO';
  if (prefix2 === 78) return 'MT';
  if (prefix2 === 79) return 'MS';
  if (prefix2 >= 80 && prefix2 <= 87) return 'PR';
  if (prefix2 >= 88 && prefix2 <= 89) return 'SC';
  if (prefix2 >= 90 && prefix2 <= 99) return 'RS';
  return null;
};

const inferByCityAndUf = (city?: string | null, uf?: UfCode | null): string | null => {
  const normalizedCity = normalizeText(String(city || ''));
  if (!normalizedCity || !uf) return null;

  if (uf === 'RJ' && normalizedCity.includes('rio de janeiro')) return 'LIGHT SESA';
  if (uf === 'SP' && normalizedCity.includes('sao paulo')) return 'ELETROPAULO';
  if (uf === 'SP' && (normalizedCity.includes('campinas') || normalizedCity.includes('ribeirao preto'))) return 'CPFL-PAULISTA';
  if (uf === 'SP' && normalizedCity.includes('santos')) return 'CPFL-PIRATINING';

  return null;
};

export const inferDistributor = (input: DistributorInferenceInput): DistributorInferenceResult | null => {
  const manual = String(input.distributor || '').trim();
  if (manual) {
    return { distributor: manual, uf: normalizeUf(input.uf), source: 'manual', confidence: 'high' };
  }

  const explicitUf = normalizeUf(input.uf);
  const cepUf = inferUfFromCep(input.cep);
  const uf = explicitUf || cepUf;
  if (!uf) return null;

  const byCity = inferByCityAndUf(input.city, uf);
  if (byCity) return { distributor: byCity, uf, source: 'city_uf', confidence: 'high' };

  const byUf = PRIMARY_DISTRIBUTOR_BY_UF[uf];
  if (!byUf) return null;

  if (!explicitUf && cepUf) return { distributor: byUf, uf, source: 'cep_uf', confidence: 'low' };
  return { distributor: byUf, uf, source: 'uf', confidence: 'medium' };
};

export const getDefaultTariffByDistributor = (distributor?: string | null): number | null => {
  const raw = String(distributor || '').trim();
  if (!raw) return null;
  const normalized = normalizeDistributorKey(raw);
  for (const [key, value] of Object.entries(DEFAULT_TARIFF_BY_DISTRIBUTOR)) {
    if (normalizeDistributorKey(key) === normalized) return value;
  }
  return null;
};
