# Geo Tools

Ferramenta web para desenhar, importar e exportar polígonos em um mapa. Os polígonos podem ser criados à mão, carregados de arquivos geoespaciais e baixados em diferentes formatos.

## Funcionalidades

- **Desenho de polígonos** direto no mapa, com edição e remoção (Leaflet Draw).
- **Importação** por arquivo (arrastar e soltar ou seletor) ou colando texto:
  - GeoJSON (`.geojson`, `.json`)
  - KML (`.kml`) e KMZ (`.kmz`)
  - WKT (`.wkt`, `.txt`)
  - Shapefile compactado (`.zip`)
  - Texto colado: GeoJSON ou WKT, com detecção automática do formato
- **Exportação** com pré-visualização do conteúdo, tamanho do arquivo, cópia para a área de transferência e download (GeoJSON, KMZ e demais formatos definidos em `utils/exportGeo.ts`).
- **Limpar mapa** para remover todos os polígonos de uma vez.
- **Camada de municípios do Brasil**, exibida apenas em zoom alto para não pesar o mapa.

### Regras da importação

- Só **polígonos** são importados. Pontos, linhas e geometrias inválidas são ignorados e o total ignorado é informado antes de confirmar.
- Cada parte de um `MultiPolygon` vira um **polígono independente** no mapa.
- Os polígonos importados entram no mesmo grupo dos desenhados, então também podem ser editados e removidos.
- Coordenadas devem estar em WGS84 (longitude/latitude). Em Shapefile, a reprojeção só acontece se o `.zip` incluir o `.prj`.
- Tamanho máximo por arquivo ou texto: 20 MB.

## Tecnologias

- React + TypeScript + [Vite](https://vite.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [Leaflet](https://leafletjs.com), [react-leaflet](https://react-leaflet.js.org) e [react-leaflet-draw](https://github.com/alex3165/react-leaflet-draw)
- Leitura de arquivos: [`@tmcw/togeojson`](https://github.com/placemark/togeojson) (KML), [`jszip`](https://stuk.github.io/jszip/) (KMZ), [`wellknown`](https://github.com/mapbox/wellknown) (WKT) e [`shpjs`](https://github.com/calvinmetcalf/shapefile-js) (Shapefile)

## Como rodar

```bash
npm install
npm run dev
```

A aplicação sobe em `http://localhost:5173`.

Outros comandos:

```bash
npm run build     # build de produção
npm run preview   # serve o build localmente
```

## Estrutura

```
src/
├── components/
│   ├── MapView.tsx       # mapa, controles (importar, exportar, limpar) e estado dos polígonos
│   ├── CitiesLayer.tsx   # camada de municípios, visível só em zoom alto
│   ├── ImportModal.tsx   # modal de importação (arquivo ou texto colado)
│   └── ExportModal.tsx   # modal de exportação com pré-visualização
└── utils/
    ├── importGeo.ts      # leitura e normalização de arquivos para polígonos GeoJSON
    └── exportGeo.ts      # geração dos arquivos de exportação
public/
└── municipios_br.json    # malha de municípios (ver abaixo)
```

## Camada de municípios

A malha completa dos municípios brasileiros é muito grande para o navegador (e para o Vite, se importada como módulo). Por isso:

1. O arquivo fica em `public/municipios_br.json` e é baixado via `fetch` somente na primeira vez que o zoom atinge o limite configurado.
2. Ele precisa ser **simplificado** antes de usar. Exemplo com [mapshaper](https://mapshaper.org):

   ```bash
   npx mapshaper municipios_br.json \
     -simplify 5% keep-shapes \
     -o public/municipios_br.json precision=0.00001
   ```

   Não deixe o arquivo original dentro de `src/`, senão o Vite tenta processá-lo e falha com `Invalid string length`.
3. Os nomes são lidos das propriedades `NOME` ou `nome` de cada feature.

## Configuração

| Constante | Arquivo | O que controla |
| --- | --- | --- |
| `LAYER_MIN_ZOOM` | `components/CitiesLayer.tsx` | Zoom mínimo para exibir os municípios (padrão `12`) |
| `MAX_FILE_BYTES` | `utils/importGeo.ts` | Tamanho máximo aceito na importação (padrão 20 MB) |
| `IMPORT_FORMATS` | `utils/importGeo.ts` | Formatos e extensões aceitos na importação |
| `center` / `zoom` | `components/MapView.tsx` | Posição e zoom iniciais do mapa |

## Observações

- Importar o mesmo arquivo duas vezes duplica os polígonos; não há checagem de duplicidade.
- "Limpar mapa" pede confirmação e não pode ser desfeito.