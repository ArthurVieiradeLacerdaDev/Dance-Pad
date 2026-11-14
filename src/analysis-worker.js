import { analyzePCM } from './analysis.js';
import { synthesize } from './synth.js';
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'synth') {
      const result = synthesize(data.style);
      self.postMessage(result, [result.samples.buffer]);
    } else self.postMessage({ analysis: analyzePCM(data.samples, data.sampleRate) });
  }
  catch (error) { self.postMessage({ error: error.message }); }
};
