export const aiProviders={
 openai:{label:'OpenAI',base:'https://api.openai.com/v1/',types:['responses','chat-completions'],defaultModel:'gpt-5-mini',models:['gpt-5-mini','gpt-5.4-mini','gpt-5.4']},
 anthropic:{label:'Anthropic Claude',base:'https://api.anthropic.com/v1/',types:['messages'],defaultModel:'claude-sonnet-5-5',models:['claude-sonnet-5-5','claude-haiku-5-5','claude-opus-5-5']},
 gemini:{label:'Google Gemini',base:'https://generativelanguage.googleapis.com/v1beta/',types:['generate-content'],defaultModel:'gemini-3.8-flash',models:['gemini-3.8-flash','gemini-3.6-flash','gemini-3.5-flash-lite']},
 deepseek:{label:'DeepSeek',base:'https://api.deepseek.com/',types:['chat-completions'],defaultModel:'deepseek-flash',models:['deepseek-flash','deepseek-v4-pro']},
 groq:{label:'Groq',base:'https://api.groq.com/openai/v1/',types:['chat-completions'],defaultModel:'llama-3.3-70b-versatile',models:['llama-3.3-70b-versatile','llama-3.1-8b-instant']},
 mistral:{label:'Mistral AI',base:'https://api.mistral.ai/v1/',types:['chat-completions'],defaultModel:'mistral-small-latest',models:['mistral-small-latest','mistral-large-latest']}
};
export const publicAIProviders=()=>Object.fromEntries(Object.entries(aiProviders).map(([id,{base,...publicInfo}])=>[id,publicInfo]));
export const validAIModel=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,149}$/.test(value)&&!value.includes('..')&&!value.includes('//');
