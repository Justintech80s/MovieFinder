export function createModelRouter({ timeoutMs = 5000 } = {}) {
  const registry = new Map();

  function register(name, adapter) {
    if (!name || typeof adapter?.invoke !== 'function') throw new TypeError('model provider requires a name and invoke function');
    registry.set(name, adapter);
    return name;
  }

  const providers = () => [...registry.keys()];

  async function run(capability, input, { provider, order } = {}) {
    const names = provider ? [provider] : order?.length ? order : providers();
    const candidates = names.filter(name => registry.get(name)?.capabilities?.includes(capability));
    const failures = [];

    for (const name of candidates) {
      const adapter = registry.get(name);
      let timer;
      try {
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error('model provider timeout'), { code: 'MODEL_PROVIDER_TIMEOUT' })), timeoutMs);
        });
        const output = await Promise.race([adapter.invoke(capability, input, { provider: name }), timeout]);
        clearTimeout(timer);
        return { provider: name, output };
      } catch (error) {
        clearTimeout(timer);
        failures.push({ provider: name, code: error.code || 'MODEL_PROVIDER_ERROR', message: error.message });
      }
    }

    throw Object.assign(new Error('no model provider available for capability'), {
      code: 'MODEL_PROVIDER_UNAVAILABLE', failures
    });
  }

  return { register, providers, run };
}
