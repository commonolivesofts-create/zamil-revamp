import oracledb from 'oracledb';

export async function findProfileImage(connection, userId) {
  const result = await connection.execute(
    `SELECT image_blob, mime_type FROM xx_zrv_user_profile_images WHERE user_id = :userId`,
    { userId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const row = result.rows[0];
  if (!row) return null;
  const chunks = [];
  for await (const chunk of row.IMAGE_BLOB) chunks.push(Buffer.from(chunk));
  return { data: Buffer.concat(chunks), mimeType: row.MIME_TYPE };
}

export async function saveProfileImage(connection, { userId, data, mimeType }) {
  await connection.execute(
    `MERGE INTO xx_zrv_user_profile_images target
     USING (SELECT :userId AS user_id FROM dual) source
        ON (target.user_id = source.user_id)
      WHEN MATCHED THEN UPDATE SET target.image_blob = :data, target.mime_type = :mimeType,
        target.updated_at = (SYSTIMESTAMP AT TIME ZONE 'UTC')
      WHEN NOT MATCHED THEN INSERT (user_id, image_blob, mime_type)
        VALUES (:userId, :data, :mimeType)`,
    { userId, data: { val: data, type: oracledb.BLOB }, mimeType },
  );
}

export async function deleteProfileImage(connection, userId) {
  await connection.execute(`DELETE FROM xx_zrv_user_profile_images WHERE user_id = :userId`, {
    userId,
  });
}
