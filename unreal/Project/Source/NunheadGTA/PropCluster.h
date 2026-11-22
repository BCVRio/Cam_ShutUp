#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "PropCluster.generated.h"

class UHierarchicalInstancedStaticMeshComponent;

// One mesh, many placements: the world export puts every house module, garden wall, tree, lamp and parked car down as
// its own node sharing one mesh, and build_green.py folds each such group into one of these (a few dozen actors instead
// of twenty thousand). Static, lit, with the mesh's own collision so walls and trunks block Cam and the ball.
UCLASS()
class NUNHEADGTA_API APropCluster : public AActor
{
	GENERATED_BODY()
public:
	APropCluster();
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Cluster") UHierarchicalInstancedStaticMeshComponent* Instances;
	UFUNCTION(BlueprintCallable, Category="Cluster") int32 Fill(UStaticMesh* Mesh, const TArray<FTransform>& WorldTransforms, bool bCollide);
};
