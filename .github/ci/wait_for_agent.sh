trap 'kill $(jobs -p)' EXIT
attempt_counter=0
max_attempts=100
mkdir -p build/reports/agent
docker-compose -f docker-compose.yml logs -f | tee build/reports/agent/log.txt&
until curl -s http://localhost:8585/api/status | jq '.registered' | grep true; do
    if [ ${attempt_counter} -eq ${max_attempts} ]; then
    echo "Agent failed to register. Terminating..."
    exit 1
    fi
    attempt_counter=$(($attempt_counter+1))
    echo
    sleep 1
done