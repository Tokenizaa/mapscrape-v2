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
  photos?: string;
  videos?: string;
  logo_url?: string;
  /** Social profile URLs explicitly present in the Google Maps place sheet, separated by |. */
  social_links?: string;
  /** JSON array of publicly visible reviews captured from the place's Reviews panel. */
  reviews?: string;
  /** JSON array of review topic/category chips and counts. */
  review_topics?: string;
  /** JSON object of additional public attributes from the About panel. */
  additional_attributes?: string;
  /** JSON array of typed media objects for image/video preview rendering. */
  media_items?: string;
  /** Plus code shown on the public place sheet, when present. */
  plus_code?: string;
  collected_at: string;
}

export type JobStatus = 'running' | 'completed' | 'partial' | 'stopped' | 'failed';

export interface ScrapeJob {
  id: string;
  user_id: string;
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
  { key: 'photos', label: 'Fotos (URLs)', description: 'URLs das fotos visíveis na ficha' },
  { key: 'videos', label: 'Vídeos (URLs)', description: 'URLs ou fontes de vídeos visíveis na ficha' },
  { key: 'logo_url', label: 'Logo / Foto de perfil', description: 'Imagem ou avatar exibido na ficha' },
  { key: 'social_links', label: 'Redes sociais (URLs)', description: 'Links sociais explicitamente exibidos na ficha do Google Maps' },
  { key: 'reviews', label: 'Avaliações individuais', description: 'Comentários, nota, autor, data, resposta do proprietário e mídia quando visíveis' },
  { key: 'review_topics', label: 'Categorias dos comentários', description: 'Tópicos sugeridos pelo Google Maps e suas contagens' },
  { key: 'additional_attributes', label: 'Atributos adicionais', description: 'Informações públicas da aba Sobre, incluindo facilidades e serviços' },
  { key: 'media_items', label: 'Mídia estruturada', description: 'Itens de mídia com tipo, URL, texto alternativo e miniatura' },
  { key: 'plus_code', label: 'Plus Code', description: 'Código geográfico apresentado na ficha' },
  { key: 'collected_at', label: 'Data e hora da coleta', description: 'Registrada pelo aplicativo' },
];
