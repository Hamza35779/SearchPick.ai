import WebSocket from 'isomorphic-ws';

export interface SearchPickConfig {
  baseUrl?: string;
}

export interface AgentStatePayload {
  agent: string;
  status: string;
}

export interface ProductListing {
  title: string;
  price: number;
  shipping: number;
  url?: string;
  store_name: string;
  thumbnail?: string;
  rating?: number;
  reviews_count?: number;
}

export interface BuyingScore {
  score: number;
  ai_confidence: number;
  value_for_money: number;
  spec_match: number;
  user_sentiment: number;
  brand_trust: number;
  warranty_score: number;
  shipping_speed: number;
  price_trend: number;
  durability: number;
  scam_risk: number;
  recommended_store?: string;
  recommended_price?: number;
  recommended_url?: string;
}

export interface FinalRecommendation {
  buying_score: BuyingScore;
  explanation: string;
}

export class SearchPickClient {
  private baseUrl: string;
  private wsUrl: string;

  constructor(config: SearchPickConfig = {}) {
    this.baseUrl = (config.baseUrl || 'http://localhost:8000').replace(/\/$/, '');
    this.wsUrl = this.baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
  }

  /**
   * Check core engine status.
   */
  async getStatus(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v1/status`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  /**
   * Upload and parse criteria spreadsheet, document, or scanned image files.
   */
  async parseFile(file: File | any, filename?: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', file, filename);

    const res = await fetch(`${this.baseUrl}/api/v1/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  /**
   * Run real-time parallel marketplace queries with LangGraph orchestration.
   * Leverages WebSockets for live status notifications and partial results.
   */
  searchStream(params: {
    query: string;
    fileContext?: string;
    onAgentState?: (state: AgentStatePayload) => void;
    onResults?: (products: ProductListing[]) => void;
  }): Promise<FinalRecommendation> {
    return new Promise((resolve, reject) => {
      const sessionId = 'sdk_ts_session';
      const ws = new WebSocket(`${this.wsUrl}/api/v1/chat/ws/${sessionId}`);

      ws.onopen = () => {
        const payload = {
          message: params.query,
          file_context: params.fileContext || null,
        };
        ws.send(JSON.stringify(payload));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());
          switch (data.type) {
            case 'agent_state':
              if (params.onAgentState) {
                params.onAgentState({ agent: data.agent, status: data.status });
              }
              break;

            case 'search_results':
              if (params.onResults) {
                params.onResults(data.products || []);
              }
              break;

            case 'final_recommendation':
              ws.close();
              resolve({
                buying_score: data.buying_score,
                explanation: data.explanation,
              });
              break;

            case 'error':
              ws.close();
              reject(new Error(data.message));
              break;
          }
        } catch (err) {
          ws.close();
          reject(err);
        }
      };

      ws.onerror = (error) => {
        reject(error);
      };
    });
  }
}
