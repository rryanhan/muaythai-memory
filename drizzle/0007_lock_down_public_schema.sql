-- Domain data is served only through authenticated Next.js handlers. Supabase
-- client roles must not be able to bypass those ownership checks through the
-- Data API. PUBLIC is included because its grants are inherited by both roles.
DO $$
DECLARE
  api_role text;
BEGIN
  REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

  FOR api_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated')
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I',
      api_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I',
      api_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM %I',
      api_role
    );
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    -- PostgreSQL grants PUBLIC function execution globally by default. Revoke
    -- that global default so a future public-schema function is not exposed
    -- indirectly to anon or authenticated.
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres
      REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres
      REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres
      REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC;

    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC;

    FOR api_role IN
      SELECT rolname
      FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated')
    LOOP
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL PRIVILEGES ON TABLES FROM %I',
        api_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
        api_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL PRIVILEGES ON FUNCTIONS FROM %I',
        api_role
      );

      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I',
        api_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
        api_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON FUNCTIONS FROM %I',
        api_role
      );
    END LOOP;
  END IF;
END
$$;
