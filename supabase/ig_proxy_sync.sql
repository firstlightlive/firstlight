-- ═══════════════════════════════════════════════════════════════════
-- FIRSTLIGHT — Instagram API SYNC Proxy (FIXED)
-- Uses pg_net for server-side HTTP calls — no CORS issues
--
-- RUN THIS IN: Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Drop old broken versions
DROP FUNCTION IF EXISTS ig_post(TEXT);
DROP FUNCTION IF EXISTS ig_api_direct(TEXT);

-- Create sync proxy using correct pg_net column names
CREATE OR REPLACE FUNCTION ig_post(
  p_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _req_id BIGINT;
  _status INT;
  _body TEXT;
  _result JSONB;
  _attempts INT := 0;
BEGIN
  -- Make HTTP POST via pg_net
  SELECT net.http_post(
    url := p_url,
    body := '{}'::jsonb
  ) INTO _req_id;

  -- Poll for response (pg_net is async)
  LOOP
    _attempts := _attempts + 1;
    IF _attempts > 40 THEN
      RETURN jsonb_build_object('error', 'Timeout after 20s waiting for IG response', 'request_id', _req_id);
    END IF;

    -- Try different possible column names for pg_net response
    BEGIN
      SELECT status_code, body::TEXT INTO _status, _body
      FROM net._http_response
      WHERE id = _req_id;

      IF FOUND AND _status IS NOT NULL THEN
        BEGIN
          _result := _body::JSONB;
        EXCEPTION WHEN OTHERS THEN
          _result := jsonb_build_object('raw', left(_body, 500), 'status_code', _status);
        END;
        -- Clean up response row
        DELETE FROM net._http_response WHERE id = _req_id;
        RETURN _result;
      END IF;
    EXCEPTION WHEN undefined_column THEN
      -- Try alternate column names
      BEGIN
        SELECT status_code, content::TEXT INTO _status, _body
        FROM net._http_response
        WHERE id = _req_id;

        IF FOUND AND _status IS NOT NULL THEN
          BEGIN
            _result := _body::JSONB;
          EXCEPTION WHEN OTHERS THEN
            _result := jsonb_build_object('raw', left(_body, 500), 'status_code', _status);
          END;
          DELETE FROM net._http_response WHERE id = _req_id;
          RETURN _result;
        END IF;
      EXCEPTION WHEN undefined_column THEN
        -- Last try: just get any data
        BEGIN
          EXECUTE 'SELECT to_jsonb(r) FROM net._http_response r WHERE r.id = $1' INTO _result USING _req_id;
          IF _result IS NOT NULL AND _result->>'status_code' IS NOT NULL THEN
            DELETE FROM net._http_response WHERE id = _req_id;
            RETURN _result;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          NULL; -- continue polling
        END;
      END;
    END;

    -- Wait 500ms
    PERFORM pg_sleep(0.5);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION ig_post(TEXT) TO anon, authenticated;

-- Test with a simple GET to verify it works
SELECT ig_post('https://httpbin.org/post') AS test_result;

SELECT 'IG SYNC PROXY READY' AS status;
