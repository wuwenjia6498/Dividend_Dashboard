/**
 * Tushare API Client for TypeScript
 * Replaces Python scripts for Vercel serverless compatibility
 */

interface TushareResponse<T> {
  code: number;
  msg: string;
  data: {
    fields: string[];
    items: any[][];
    has_more: boolean;
  };
}

interface DailyBasicData {
  ts_code: string;
  trade_date: string;
  close: number;
  pe_ttm: number;
  pb: number;
  dv_ttm: number;
  total_mv: number;
}

interface FinaIndicatorData {
  ts_code: string;
  end_date: string;
  ann_date: string;
  netprofit_yoy: number;
  dt_netprofit_yoy: number;
  ocf_yoy: number;
}

interface DividendData {
  ts_code: string;
  end_date: string;
  ann_date: string;
  div_proc: string;
  stk_div: number;
  stk_bo_rate: number;
  stk_co_rate: number;
  cash_div: number;
  cash_div_tax: number;
  record_date: string;
  ex_date: string;
  pay_date: string;
  div_listdate: string;
  imp_ann_date: string;
  base_share: number;
  base_date: string;
}

interface CashflowData {
  ts_code: string;
  end_date: string;
  n_cashflow_act: number; // Operating cash flow
}

export class TushareClient {
  private readonly baseUrl = 'http://api.tushare.pro';
  private readonly token: string;
  private readonly requestDelay = 500; // ms between requests

  constructor(token?: string) {
    this.token = token || process.env.TUSHARE_TOKEN || '';
    if (!this.token) {
      throw new Error('TUSHARE_TOKEN is required');
    }
  }

  private async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async request<T>(
    apiName: string,
    params: Record<string, any> = {},
    fields?: string
  ): Promise<T[]> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_name: apiName,
        token: this.token,
        params: params,
        fields: fields,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tushare API error: ${response.statusText}`);
    }

    const result: TushareResponse<T> = await response.json();

    if (result.code !== 0) {
      throw new Error(`Tushare API error: ${result.msg}`);
    }

    // Convert items array to objects
    const { fields, items } = result.data;
    return items.map(item => {
      const obj: any = {};
      fields.forEach((field, index) => {
        obj[field] = item[index];
      });
      return obj as T;
    });
  }

  /**
   * Convert stock symbol to Tushare ts_code format
   * 600036 -> 600036.SH
   * 000651 -> 000651.SZ
   */
  convertToTsCode(symbol: string): string {
    if (symbol.startsWith('6')) {
      return `${symbol}.SH`;
    } else if (symbol.startsWith('0') || symbol.startsWith('3')) {
      return `${symbol}.SZ`;
    }
    return `${symbol}.SH`;
  }

  /**
   * Fetch daily basic data (price, PE, PB, dividend yield, etc.)
   */
  async fetchDailyBasic(params: {
    ts_code?: string;
    trade_date?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<DailyBasicData[]> {
    await this.sleep(this.requestDelay);

    return this.request<DailyBasicData>(
      'daily_basic',
      params,
      'ts_code,trade_date,close,pe_ttm,pb,dv_ttm,total_mv'
    );
  }

  /**
   * Fetch financial indicators (YoY growth, etc.)
   */
  async fetchFinaIndicator(params: {
    ts_code: string;
    period?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<FinaIndicatorData[]> {
    await this.sleep(this.requestDelay);

    return this.request<FinaIndicatorData>(
      'fina_indicator',
      params,
      'ts_code,end_date,ann_date,netprofit_yoy,dt_netprofit_yoy,ocf_yoy'
    );
  }

  /**
   * Fetch dividend data
   */
  async fetchDividend(params: {
    ts_code: string;
    ann_date?: string;
    ex_date?: string;
  }): Promise<DividendData[]> {
    await this.sleep(this.requestDelay);

    return this.request<DividendData>(
      'dividend',
      params
    );
  }

  /**
   * Fetch cashflow data (operating cash flow)
   */
  async fetchCashflow(params: {
    ts_code: string;
    period?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<CashflowData[]> {
    await this.sleep(this.requestDelay);

    return this.request<CashflowData>(
      'cashflow',
      params,
      'ts_code,end_date,n_cashflow_act'
    );
  }

  /**
   * Get latest trading date
   */
  async getLatestTradeDate(ts_code: string): Promise<string | null> {
    const data = await this.fetchDailyBasic({
      ts_code,
      start_date: this.formatDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
      end_date: this.formatDate(new Date()),
    });

    if (data.length === 0) {
      return null;
    }

    // Sort by trade_date descending
    data.sort((a, b) => b.trade_date.localeCompare(a.trade_date));
    return data[0].trade_date;
  }

  /**
   * Format date to YYYYMMDD
   */
  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Parse YYYYMMDD to Date
   */
  parseDate(dateStr: string): Date {
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    return new Date(year, month, day);
  }
}

// Export singleton instance
let tushareInstance: TushareClient | null = null;

export function getTushareClient(): TushareClient {
  if (!tushareInstance) {
    tushareInstance = new TushareClient();
  }
  return tushareInstance;
}
