const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Pull the QA-relevant fields out of a stored call:
 *  - call_date:     when the call happened (stored call_timestamp)
 *  - call_duration: longest leg duration in seconds (the actual conversation)
 *  - call_number:   caller number (Source Src / Src from the CDR legs)
 */
export const extractCallMeta = (call) => {
  const legs = Array.isArray(call?.raw_data?.legs) ? call.raw_data.legs : [];

  let callNumber = '';
  let callDuration = null;

  for (const leg of legs) {
    if (!leg || typeof leg !== 'object') continue;

    if (!callNumber) {
      const src = leg['Src'] || leg['Source Src'];
      if (src) callNumber = String(src).trim();
    }

    const duration = toNumber(leg['Duration']);
    if (duration != null && (callDuration == null || duration > callDuration)) {
      callDuration = duration;
    }
  }

  const callDate = call?.call_timestamp ? new Date(call.call_timestamp).toISOString() : null;

  return {
    call_date: callDate,
    call_duration: callDuration,
    call_number: callNumber || null,
  };
};
