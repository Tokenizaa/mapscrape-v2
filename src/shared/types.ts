export interface PlaceRecord {
  id: string;
  job_id: string;
  name: string;
  category: string;
  address: string;
  phone: string;
  website: string;
  rating: string;
  review_count: string;
  price_range: string;
  opening_hours: string;
  business_status: string;
  latitude: string;
  longitude: string;
  maps_url: string;
  description: string;
  services_attributes: string;
  collected_at: string;
}

export type JobStatus = 'running' | 'completed' | 'stopped' | 'failed';

export interface ScrapeJob {
  id: string;
  segment: string;
  location: string;
  limit_requested: number;
  status: JobStatus;
  status_message: string;
  total_found: number;
  total_collected: number;
  total_duplicates: number;
  total_errors: number;
  current_step?: string;
  created_at: string;
  completed_at?: string;
}

export interface ScrapeStartPayload {
  segment: string;
  location: string;
  limit: number;
}

export interface ExportCsvPayload {
  jobId?: string;
  placeIds?: string[];
  fields: (keyof PlaceRecord)[];
  filename?: string;
}

export const EXPORTABLE_FIELDS: { key: keyof PlaceRecord; label: string; description: string }[] = [
  { key: 'name', label: 'Nome do estabelecimento', description: 'Nome exibido na ficha' },
  { key: 'category', label: 'Categoria', description: 'Categoria exibida' },
  { key: 'address', label: 'Endereço', description: 'Endereço exibido' },
  { key: 'phone', label: 'Telefone', description: 'Telefone exibido' },
  { key: 'website', label: 'Site', description: 'URL apresentada na ficha' },
  { key: 'rating', label: 'Nota', description: 'Avaliação exibida' },
  { key: 'review_count', label: 'Quantidade de avaliações', description: 'Número exibido' },
  { key: 'price_range', label: 'Faixa de preço', description: 'Quando exibida' },
  { key: 'opening_hours', label: 'Horários de funcionamento', description: 'Horários apresentados na ficha' },
  { key: 'business_status', label: 'Status de funcionamento', description: 'Aberto, fechado, etc.' },
  { key: 'latitude', label: 'Latitude', description: 'Extraída diretamente dos dados da URL/página' },
  { key: 'longitude', label: 'Longitude', description: 'Extraída diretamente dos dados da URL/página' },
  { key: 'maps_url', label: 'Link do Google Maps', description: 'URL da ficha' },
  { key: 'description', label: 'Descrição', description: 'Descrição apresentada, se houver' },
  { key: 'services_attributes', label: 'Serviços e atributos', description: 'Informações exibidas na ficha' },
  { key: 'collected_at', label: 'Data e hora da coleta', description: 'Registrada pelo aplicativo' },
];
