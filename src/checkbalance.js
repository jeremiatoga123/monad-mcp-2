import axios from 'axios'

export const accountTokens = async (account) => {
  try {
    const header = {
        'accept': 'application/json',
        'x-api-key': '2wRzTfbGfyQmHUEWvuJDvx45H9N'
    }
    const response = await axios.get(`https://api.blockvision.org/v2/monad/account/tokens?address=${account}`, { headers: header });
    if (response.status !== 200) {
      throw new Error(`Error fetching account tokens: ${response.statusText}`);
    }
    const tokenBalances = response.data.result.data.map(token => 
        `${token.symbol} : ${token.balance} : ${token.contractAddress} : ${token.decimal}`
      ).join('\n');
    return tokenBalances;
  } catch (error) {
    console.error('Error fetching account tokens:', error);
    throw error;
  }
}